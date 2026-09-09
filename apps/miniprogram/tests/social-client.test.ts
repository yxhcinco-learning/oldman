import { describe, expect, it, vi, afterEach } from 'vitest';
import { MiniSocialClient } from '../miniprogram/social/client';
import { MiniAccountClient, type AccountPlatform, type MiniSessionAuthorizer } from '../miniprogram/auth/account-client';
const auth: MiniSessionAuthorizer = { authorizedRequest: action => action('isolated-token') };
const wallet = { balance: 3, version: 1, today: '2026-09-09', claimedToday: true, dailyAmount: 3 };
function setup() {
  const request = vi.fn<AccountPlatform['request']>().mockResolvedValue({statusCode: 200, data: wallet});
  const client = new MiniSocialClient(auth, {login: async () => 'isolated', request});
  return {client, request};
}
afterEach(() => vi.useRealTimers());
describe('社交请求的权限、未知结果与每日领取', () => {
  it('游客读取独立public接口且绝不附带token，账号读取只走mini', async () => {
    const {client,request} = setup();
    await client.article('article', false); await client.comments('article', false); await client.author('author',false); await client.article('article',true);
    expect(request.mock.calls.map(c => [c[0],c[2]])).toEqual([['/api/public/articles/article',undefined],['/api/public/articles/article/comments',undefined],['/api/public/authors/author',undefined],['/api/mini/articles/article','isolated-token']]);
  });
  it('鉴权失败不偷偷降级公共请求', async () => {
    const {client,request}=setup(); request.mockResolvedValueOnce({statusCode:401,data:{code:'session_replaced',error:'登录已失效'}});
    await expect(client.article('article',true)).rejects.toMatchObject({status:401});
    expect(request).toHaveBeenCalledTimes(1); expect(request.mock.calls[0][0]).toBe('/api/mini/articles/article');
  });
  it('同一公共读取合并在途，完成后下一次重新核对可用性', async () => {
    const {client,request}=setup(); let resolve!: (value:{statusCode:number,data:unknown})=>void;
    request.mockReturnValue(new Promise(done=>{resolve=done;}));
    const first=client.article('a',false), second=client.article('a',false);
    expect(request).toHaveBeenCalledTimes(1); resolve({statusCode:200,data:{id:'a'}}); await Promise.all([first,second]);
    await client.article('a',false); expect(request).toHaveBeenCalledTimes(2);
  });
  it('评论响应丢失只重试原文本与原操作ID，账号内可恢复待确认输入', async () => {
    const {client,request}=setup(); request.mockRejectedValueOnce(new Error('响应丢失'));
    await expect(client.comment('article','原评论')).rejects.toThrow();
    expect(client.pendingComment('article')).toBe('原评论');
    await expect(client.comment('article','不同文字')).rejects.toThrow('尚未确认');
    expect(request).toHaveBeenCalledTimes(1);
    await client.comment('article','原评论'); expect(request.mock.calls[0][3]).toEqual(request.mock.calls[1][3]);
    expect(client.pendingComment('article')).toBeUndefined();
  });
  it('赠送丢失回执后仍用原ID核对，成功才允许下一次赠送', async () => {
    const {client,request}=setup(); request.mockRejectedValueOnce(new Error('断网'));
    await expect(client.gift('article')).rejects.toThrow(); expect(client.hasPending('gift:article')).toBe(true);
    request.mockResolvedValue({statusCode:200,data:{operationId:'receipt',sent:true,balance:2,flowers:1}});
    await client.gift('article'); expect(request.mock.calls[1][3]).toEqual(request.mock.calls[0][3]);
    expect(client.hasPending('gift:article')).toBe(false);
    await client.gift('article'); expect(request.mock.calls[2][3]).not.toEqual(request.mock.calls[1][3]);
  });
  it('原操作两个回执迟到交错时，不清除用户后来新送花的待确认ID', async () => {
    const {client,request}=setup();
    let resolveFirst!:(v:{statusCode:number;data:unknown})=>void, resolveRetry!:(v:{statusCode:number;data:unknown})=>void, rejectNext!:(e:Error)=>void;
    request.mockReturnValueOnce(new Promise(done=>{resolveFirst=done;})).mockReturnValueOnce(new Promise(done=>{resolveRetry=done;})).mockReturnValueOnce(new Promise((_,no)=>{rejectNext=no;}));
    const first=client.gift('article'), retry=client.gift('article');expect(request.mock.calls[0][3]).toEqual(request.mock.calls[1][3]);
    resolveFirst({statusCode:200,data:{sent:true}});await first;
    const next=client.gift('article');expect(request.mock.calls[2][3]).not.toEqual(request.mock.calls[0][3]);
    resolveRetry({statusCode:200,data:{sent:true}});await retry;expect(client.hasPending('gift:article')).toBe(true);
    rejectNext(new Error('结果未知'));await expect(next).rejects.toThrow();
    request.mockResolvedValue({statusCode:200,data:{sent:true}});await client.gift('article');expect(request.mock.calls[3][3]).toEqual(request.mock.calls[2][3]);
  });
  it('余额不足是明确失败，不保留一个无法完成的赠送操作',async()=>{
    const {client,request}=setup();request.mockResolvedValue({statusCode:409,data:{code:'insufficient_flowers',error:'小花花不足'}});
    await expect(client.gift('article')).rejects.toMatchObject({status:409});expect(client.hasPending('gift:article')).toBe(false);
  });
  it('本机时间落后时仍按服务端次日领取；当天成功不重复POST',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-01T00:00:00Z'));
    const {client,request}=setup();await client.claim();expect(request).toHaveBeenCalledTimes(1);
    request.mockResolvedValueOnce({statusCode:200,data:{...wallet,today:'2026-09-10',claimedToday:false}}).mockResolvedValueOnce({statusCode:200,data:{...wallet,today:'2026-09-10',balance:6}});
    expect((await client.claim()).balance).toBe(6);expect(request.mock.calls.filter(c=>c[0].endsWith('/claim'))).toHaveLength(1);
    request.mockResolvedValue({statusCode:200,data:{...wallet,today:'2026-09-10',balance:6}});await client.claim();
    expect(request.mock.calls.filter(c=>c[0].endsWith('/claim'))).toHaveLength(1);
  });
  it('并发进入共享一次钱包核对与领取；读取失败不把未知库存当0或本地发花',async()=>{
    const {client,request}=setup();request.mockResolvedValueOnce({statusCode:200,data:{...wallet,claimedToday:false}});
    const first=client.claim(),second=client.claim();expect(first).toBe(second);await Promise.all([first,second]);expect(request).toHaveBeenCalledTimes(2);
    request.mockRejectedValueOnce(new Error('暂时断网'));await expect(client.claim()).rejects.toThrow();expect(request).toHaveBeenCalledTimes(3);
  });
  it('换账号后旧client不能执行待确认写入，新client没有旧草稿/回执',async()=>{
    const record={id:'a',nickname:'隔离',avatarVersion:0,hasAvatar:false,expiresAt:'2099-01-01T00:00:00Z'};
    const request=vi.fn<AccountPlatform['request']>().mockResolvedValue({statusCode:200,data:{token:'a'.repeat(43),account:record}});
    const platform={login:async()=>'code',request};const account=new MiniAccountClient(platform,{read:async()=>undefined,write:async()=>{},clear:async()=>{}});
    await account.login();const client=new MiniSocialClient(account.bound(account.snapshot().generation,'a'),platform);
    request.mockRejectedValueOnce(new Error('丢失'));await expect(client.comment('article','旧稿')).rejects.toThrow();
    await account.logout();request.mockResolvedValue({statusCode:200,data:{token:'b'.repeat(43),account:{...record,id:'b'}}});await account.login();
    await expect(client.comment('article','旧稿')).rejects.toMatchObject({code:'account_changed'});
    const other=new MiniSocialClient(account.bound(account.snapshot().generation,'b'),platform);expect(other.pendingComment('article')).toBeUndefined();
  });
  it('文章再访记录跨页面实例且按当前账号client隔离，有界于本次运行', () => {
    const {client}=setup();expect(client.visitArticle('article')).toBe(false);expect(client.visitArticle('article')).toBe(true);
    const other=setup().client;expect(other.visitArticle('article')).toBe(false);
    for(let i=0;i<101;i++) client.visitArticle('bounded-'+i);
    expect(client.visitArticle('article')).toBe(false);
  });
  it('短期事件标识定时轮换并且不包含评论、私有账号或token',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-10T00:00:00Z'));
    const {client,request}=setup();client.event('event-article-1','share_entry_open','read',false);await Promise.resolve();
    const first=request.mock.calls[0][3] as Record<string,unknown>;
    vi.advanceTimersByTime(26*60_000);client.event('event-article-2','share_entry_open','read',false);await Promise.resolve();
    const second=request.mock.calls[1][3] as Record<string,unknown>;
    expect(first.sessionId).not.toBe(second.sessionId);expect(Object.keys(second).sort()).toEqual(['action','articleId','event','eventId','sessionId']);expect(request.mock.calls[1][2]).toBeUndefined();
  });
});
