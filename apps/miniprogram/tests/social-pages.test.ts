import { afterEach, describe, expect, it, vi } from 'vitest';
import type { miniServices } from '../miniprogram/services';
const context=vi.hoisted(()=>({services:{} as ReturnType<typeof miniServices>,login:vi.fn()}));
vi.mock('../miniprogram/services',()=>({miniServices:()=>context.services}));
vi.mock('../miniprogram/auth/navigation',()=>({openLogin:context.login}));
vi.mock('../miniprogram/auth/page',()=>({accountPage:(definition:object)=>Page(definition)}));
interface ListPage {
  active:boolean; sequence:number;
  data:{collections:Array<{articleId:string;available:boolean;article:object|null;image:string}>;authors:Array<{id:string}>;articles:Array<{id:string}>;wallet:object|null;error:string;needsLogin:boolean;loading:boolean;cursor:string|null;tab:string;busy:string};
  onLoad(query:Record<string,string>):void;onShow():Promise<void>;onHide():void;refresh():Promise<void>;more():Promise<void>;removeCollection(event:object):Promise<void>;setData(value:object):void;
}
const author={id:'author',name:'公开作者',avatar:'default',following:1,followers:2,articles:1,flowers:1,relationship:{active:true,followedBy:false,mutual:false,self:false,version:1}};
const article={id:'article',title:'可读文章',authorName:'公开作者',publicAuthorId:'author',publishedAt:'2026-09-09',version:1,aiAssisted:false,excerpt:'摘要'};
async function setup(kind:'author'|'collections'|'relationships'|'flowers',logged=true){
  vi.resetModules();let listener!:(state:object)=>void;
  const state={account:logged?{id:'account'}:null,status:logged?'authenticated':'guest',generation:logged?1:0};
  const social={author:vi.fn(async()=>author),articles:vi.fn(async()=>({articles:[article],cursor:null})),article:vi.fn(async()=>({...article,body:'正文'})),image:vi.fn(async()=>new ArrayBuffer(3)),
    collections:vi.fn(async()=>({collections:[{articleId:'article',available:true,article,version:1,collectedAt:'2026-09-09'}],cursor:null as string|null})),relationships:vi.fn(async()=>({authors:[author],cursor:null as string|null})),
    claim:vi.fn(async()=>({balance:3,claimedToday:true,today:'2026-09-09',version:1,dailyAmount:3})),history:vi.fn(async()=>({entries:[],cursor:null})),reaction:vi.fn(async()=>({active:false,version:2})),follow:vi.fn()};
  const services={account:{snapshot:()=>state,restore:async()=>{},subscribe:(fn:(state:object)=>void)=>{listener=fn;return()=>{};}},social,publicationStorage:{cacheImage:async()=>'/isolated.jpg'},publicImages:{cacheImage:async()=>'/public.jpg'}};
  context.services=services as unknown as ReturnType<typeof miniServices>;
  let definition!:ListPage;vi.stubGlobal('Page',(value:ListPage)=>{definition=value;});vi.stubGlobal('wx',{navigateTo:vi.fn(),switchTab:vi.fn(),showModal:vi.fn(async()=>({confirm:true}))});
  const {socialPage}=await import('../miniprogram/social/page');socialPage(kind);
  const page={...definition,data:structuredClone(definition.data),setData(value:object){Object.assign(this.data,value);}};
  page.onLoad({id:'author'});await page.onShow();return{page,social,state,services,emit:(value:object)=>listener(value)};
}
afterEach(()=>vi.unstubAllGlobals());
describe('作者与本人互动列表',()=>{
  it('作者游客页只读public作者与文章，不读取私有名单',async()=>{
    const s=await setup('author',false);expect(s.social.author).toHaveBeenCalledWith('author',false);expect(s.social.articles).toHaveBeenCalledWith('author',false,null);expect(s.social.relationships).not.toHaveBeenCalled();
  });
  it.each(['collections','relationships','flowers'] as const)('%s会话失效立即隐藏数据并显示重新登录，不能假空或白屏',async kind=>{
    const s=await setup(kind);s.state.status='expired';s.emit(s.state);
    expect(s.page.data).toMatchObject({collections:[],authors:[],wallet:null,needsLogin:true,loading:false});expect(s.page.data.error).toContain('登录已失效');
    const calls=[s.social.collections.mock.calls.length,s.social.relationships.mock.calls.length,s.social.claim.mock.calls.length];await s.page.refresh();
    expect([s.social.collections.mock.calls.length,s.social.relationships.mock.calls.length,s.social.claim.mock.calls.length]).toEqual(calls);
  });
  it('收藏图片核对发现已下架只显示失效占位，仍可单独移除',async()=>{
    const s=await setup('collections');s.social.article.mockRejectedValueOnce(Object.assign(new Error('撤下'),{status:404}));await s.page.refresh();
    expect(s.page.data.collections[0]).toMatchObject({available:false,article:null,image:''});
    await s.page.removeCollection({currentTarget:{dataset:{id:'article'}}});expect(s.page.data.collections).toEqual([]);expect(wx.navigateTo).not.toHaveBeenCalled();expect(s.social.reaction).toHaveBeenCalledWith('article','collection',expect.objectContaining({active:false,expectedVersion:1}));
  });
  it('关系列表真实分页去重，隐藏后迟到结果不进入原页',async()=>{
    const s=await setup('relationships');s.page.data.cursor='opaque-next';s.social.relationships.mockResolvedValueOnce({authors:[author,{...author,id:'second'}],cursor:'next'});
    await s.page.more();expect(s.page.data.authors.map(a=>a.id)).toEqual(['author','second']);
    let done!:(value:{authors:typeof author[];cursor:null})=>void;s.social.relationships.mockReturnValueOnce(new Promise(resolve=>{done=resolve;}));const pending=s.page.more();s.page.onHide();done({authors:[{...author,id:'late'}],cursor:null});await pending;
    expect(s.page.data.authors.map(a=>a.id)).toEqual(['author','second']);
  });
  it('库存读取失败显示错误与未知库存，不显示0或虚构记录',async()=>{
    const s=await setup('flowers');s.social.claim.mockRejectedValueOnce(new Error('网络不可用'));await s.page.refresh();expect(s.page.data.wallet).toBeNull();expect(s.page.data.error).toContain('网络不可用');
  });
  it('账号切换期间收藏响应不能覆盖新账号',async()=>{
    const s=await setup('collections');let done!:(v:{collections:[];cursor:null})=>void;s.social.collections.mockReturnValueOnce(new Promise(resolve=>{done=resolve;}));const pending=s.page.refresh();
    context.services={} as ReturnType<typeof miniServices>;s.emit({status:'authenticated',account:{id:'other'},generation:2});done({collections:[],cursor:null});await pending;expect(s.page.data.collections).toEqual([]);expect(s.page.data.needsLogin).toBe(true);
  });
});
