import { afterEach, describe, expect, it, vi } from 'vitest';
import type { miniServices } from '../miniprogram/services';
const context=vi.hoisted(()=>({services:{} as ReturnType<typeof miniServices>}));
vi.mock('../miniprogram/services',()=>({miniServices:()=>context.services}));
import { openLogin, finishLogin, clearLoginReturn, cancelSocialLogin, prepareSocialLoginAttempt } from '../miniprogram/auth/navigation';
import { socialReturn, takeSocialReturn, takeCancelledContext, bindSocialReturn } from '../miniprogram/social/intent';
function account(id:string|null,generation:number,status='authenticated') {
  context.services={account:{snapshot:()=>({account:id?{id}:null,generation,status})}} as ReturnType<typeof miniServices>;
}
afterEach(()=>{clearLoginReturn();vi.unstubAllGlobals();});
describe('有限社交登录意图与评论阅读上下文',()=>{
  it.each(['like','collect','follow'] as const)('%s只续接原明确目标一次，不变成toggle',async kind=>{
    vi.stubGlobal('wx',{reLaunch:vi.fn().mockResolvedValue({})});account(null,0,'guest');
    const target=socialReturn('article','public-id',{kind,target:true},null,0);
    await openLogin({url:'/ignored',social:target});prepareSocialLoginAttempt(0);account('new-account',1);await finishLogin(()=>true);
    expect(takeSocialReturn('article','public-id','new-account',1)?.intent).toEqual({kind,target:true});
    expect(takeSocialReturn('article','public-id','new-account',1)).toBeUndefined();
  });
  it.each(['like','comment'] as const)('首次失败再明确重试登录后%s仍恢复同一流程',async kind=>{
    vi.stubGlobal('wx',{reLaunch:vi.fn().mockResolvedValue({})});account(null,0,'guest');
    const intent=kind==='comment'?{kind,draft:'尚未发布的回应'}:{kind,target:true};
    const target=socialReturn('article','article',intent,null,0);await openLogin({url:'/ignored',social:target});
    prepareSocialLoginAttempt(0);account(null,1,'guest');prepareSocialLoginAttempt(1);account('account',2);await finishLogin(()=>true);
    expect(takeSocialReturn('article','article','account',2)?.intent).toEqual(intent);
  });
  it('登录取消清操作但保持本次评论草稿和阅读/留言滚动',async()=>{
    const reLaunch=vi.fn().mockResolvedValue({});vi.stubGlobal('wx',{reLaunch});account(null,0,'guest');
    const target=socialReturn('article','article',{kind:'comment',draft:'未发送'},null,0);
    target.context={draft:'未发送',scrollTop:1360,sheet:'comments',commentScroll:220};
    await openLogin({url:'/ignored',social:target});await cancelSocialLogin();
    expect(reLaunch).toHaveBeenLastCalledWith({url:'/pages/article/index?id=article'});
    expect(takeSocialReturn('article','article',null,0)).toBeUndefined();
    expect(takeCancelledContext('article',null,0)).toEqual(target.context);expect(takeCancelledContext('article',null,0)).toBeUndefined();
  });
  it('原账号失效后切到其他账号不执行旧动作也不填原账号草稿',async()=>{
    const target=socialReturn('article','article',{kind:'comment',draft:'账号A的草稿'},'a',5);target.loginGeneration=6;
    bindSocialReturn(target,'b',6);expect(takeSocialReturn('article','article','b',6)).toBeUndefined();
    bindSocialReturn(target,'a',7);expect(takeSocialReturn('article','article','a',7)).toBeUndefined();
  });
  it('礼物和举报只保存重开面板的意图，不携带已执行的操作',()=>{
    const gift=socialReturn('article','article',{kind:'gift'},null,0);bindSocialReturn(gift,'a',1);
    expect(takeSocialReturn('article','article','a',1)?.intent).toEqual({kind:'gift'});
    const report=socialReturn('article','article',{kind:'report',commentId:'public-comment'},null,0);bindSocialReturn(report,'a',1);
    expect(takeSocialReturn('article','article','a',1)?.intent).toEqual({kind:'report',commentId:'public-comment'});
  });
  it('离开登录页的迟到成功不导航；其他公开目标不能消费意图',async()=>{
    const reLaunch=vi.fn().mockResolvedValue({});vi.stubGlobal('wx',{reLaunch});account(null,0,'guest');
    const target=socialReturn('article','article',{kind:'like',target:true},null,0);await openLogin({url:'/ignored',social:target});account('a',1);reLaunch.mockClear();
    await finishLogin(()=>false);expect(reLaunch).not.toHaveBeenCalled();
    await finishLogin(()=>true);expect(takeSocialReturn('article','other-article','a',1)).toBeUndefined();
  });
  it('拒绝不合法公开ID和作者页不支持的动作',()=>{
    expect(()=>socialReturn('article','../../private',{kind:'read'},null,0)).toThrow();
    expect(()=>socialReturn('author','author',{kind:'gift'},null,0)).toThrow();
  });
});
