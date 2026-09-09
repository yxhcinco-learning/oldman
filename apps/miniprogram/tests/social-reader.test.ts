import { afterEach, describe, expect, it, vi } from 'vitest';
import type { miniServices } from '../miniprogram/services';
import type { Engagement, PublicArticle, PublicComment } from '../miniprogram/domain/core';
const fixture=vi.hoisted(()=>({services:{} as ReturnType<typeof miniServices>, openLogin:vi.fn()}));
vi.mock('../miniprogram/services',()=>({miniServices:()=>fixture.services}));
vi.mock('../miniprogram/auth/navigation',()=>({openLogin:fixture.openLogin}));
const article:PublicArticle={id:'article',publicAuthorId:'author',title:'真实隔离文章',body:'隔离正文',authorName:'作者',aiAssisted:false,publishedAt:'2026-09-09T00:00:00Z',version:1,audienceVersion:1,counts:{likes:0,comments:0,flowers:0}};
const comment:PublicComment={id:'comment',articleId:'article',publicAuthorId:'other',authorName:'读者',avatar:'default',text:'公开的回应',createdAt:'2026-09-09T00:00:00Z',version:1};
const engagement:Engagement={articleId:'article',counts:{likes:0,comments:1,flowers:0},like:{active:false,version:0},collection:{active:false,version:0},relationship:{active:false,version:0,followedBy:false,mutual:false,self:false},wallet:{balance:3,version:1,today:'2026-09-09',claimedToday:true,dailyAmount:3},ownComments:[],writesEnabled:true,commentsEnabled:true};
interface Reader {
  id:string; sequence:number; active:boolean; authenticated:boolean; scrollTop:number; commentScroll:number;
  data:{article:PublicArticle|null; image:string; shareReady:boolean; loading:boolean; engagement:Engagement|null; comments:Array<PublicComment & {own:boolean;stateLabel:string}>; draft:string; draftLength:number; sheet:string; busy:string; socialError:string; error:string; giftPending:boolean; notice:string; sheetHeight:number; scrollHeight:number; ownerWorkId:string; logged:boolean; [key:string]:unknown};
  onLoad(query:Record<string,string>):void;onShow():Promise<void>;onHide():void;onUnload():void;refresh():Promise<void>;
  react(event:object):Promise<void>;applyReaction(kind:'like'|'collect'|'follow',active:boolean):Promise<void>;publishComment():Promise<void>;sendFlower():Promise<void>;openGift():Promise<void>;
  commentMore(event:object):Promise<void>;openComments():void;keyboard(event:object):void;refreshSocial():Promise<void>;loadComments(more?:boolean):Promise<void>;
  setData(data:object):void;
}
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes;});return{promise,resolve};};
async function setup(logged=true){
  vi.resetModules();fixture.openLogin.mockReset();
  const state={account:logged?{id:'account'}:null,generation:logged?1:0,status:logged?'authenticated':'guest'};
  let listener!:(state:object)=>void;
  const social={article:vi.fn(async()=>({...article})),image:vi.fn(async()=>new ArrayBuffer(3)),comments:vi.fn(async()=>({comments:[comment],cursor:null as string|null})),engagement:vi.fn(async()=>structuredClone(engagement)),
    reaction:vi.fn(async()=>({active:true,version:1,counts:{likes:1,comments:1,flowers:0}})),follow:vi.fn(async()=>({...engagement.relationship,active:true,version:1})),
    claim:vi.fn(async()=>engagement.wallet),gift:vi.fn(async()=>({sent:true,balance:2,flowers:1})),comment:vi.fn(async()=>({...comment,id:'mine',state:'pending',reason:''})),
    deleteComment:vi.fn(async()=>({deleted:true})),report:vi.fn(async()=>({reported:true})),event:vi.fn(),hasPending:vi.fn(()=>false),pendingComment:vi.fn(()=>undefined),visitArticle:vi.fn(()=>false)};
  const cacheImage=vi.fn(async()=>'/private/confirmed.jpg'),publicCache=vi.fn(async()=>'/public/confirmed.jpg');
  const statuses=vi.fn(async()=>({publications:[]}));
  const services={account:{snapshot:()=>state,restore:vi.fn(async()=>{}),subscribe:(fn:(state:object)=>void)=>{listener=fn;return()=>{};}},social,
    publicationStorage:{cacheImage},publicImages:{cacheImage:publicCache},publications:{statuses},generation:state.generation};
  fixture.services=services as unknown as ReturnType<typeof miniServices>;
  const hideShareMenu=vi.fn(async()=>{}),pageScrollTo=vi.fn(async()=>{}),showActionSheet=vi.fn(async()=>({tapIndex:0})),showModal=vi.fn(async()=>({confirm:true}));
  vi.stubGlobal('wx',{getWindowInfo:()=>({windowWidth:360,windowHeight:640}),hideShareMenu,showShareMenu:vi.fn(async()=>{}),pageScrollTo,showActionSheet,showModal,switchTab:vi.fn(),navigateTo:vi.fn()});
  let definition!:Reader;vi.stubGlobal('Page',(value:Reader)=>{definition=value;});await import('../miniprogram/pages/article/index');
  const page={...definition,data:structuredClone(definition.data),setData(data:object){Object.assign(this.data,data);}};
  page.onLoad({id:'article'});await page.onShow();
  return{page,social,services,cacheImage,publicCache,statuses,hideShareMenu,pageScrollTo,showActionSheet,showModal,state,emit:(value:object)=>listener(value)};
}
afterEach(()=>vi.unstubAllGlobals());
describe('真实阅读页控制器的游客、互动与生命周期',()=>{
  it('游客先读文章，不读取本人发表/互动态；图片使用独立公共目录',async()=>{
    const s=await setup(false);expect(s.page.data.article?.body).toBe(article.body);expect(s.social.article).toHaveBeenCalledWith('article',false);
    expect(s.statuses).not.toHaveBeenCalled();expect(s.social.engagement).not.toHaveBeenCalled();expect(s.cacheImage).not.toHaveBeenCalled();expect(s.publicCache).toHaveBeenCalledOnce();
  });
  it('图片写盘后重新核对受众；回收权限即清可见正文、评论和分享',async()=>{
    const s=await setup(false);s.social.article.mockResolvedValueOnce(article).mockRejectedValueOnce(Object.assign(new Error('已关闭'),{status:404}));
    await s.page.refresh();expect(s.page.data).toMatchObject({article:null,image:'',shareReady:false,comments:[]});expect(s.hideShareMenu).toHaveBeenCalled();
  });
  it('页面隐藏后迟到读取不安装正文或图片',async()=>{
    const s=await setup(),read=deferred<PublicArticle>();s.social.article.mockReturnValueOnce(read.promise);
    const running=s.page.refresh();s.page.onHide();read.resolve(article);await running;
    expect(s.page.data).toMatchObject({article:null,image:'',shareReady:false,comments:[]});
  });
  it('点赞期间文章下架，确认404清所有旧可见内容与分享菜单',async()=>{
    const s=await setup();s.social.reaction.mockRejectedValueOnce(Object.assign(new Error('已撤下'),{status:404}));
    await s.page.applyReaction('like',true);expect(s.page.data).toMatchObject({article:null,image:'',shareReady:false,comments:[]});expect(s.page.data.error).toContain('暂时无法查看');
  });
  it('评论读失败与空评论分开，网络错误不会制造示例或零库存',async()=>{
    const s=await setup();s.social.comments.mockRejectedValueOnce(new Error('网络不可用'));await s.page.loadComments();
    expect(s.page.data.commentsError).toContain('网络不可用');expect(s.page.data.wallet).toEqual(engagement.wallet);
    s.social.comments.mockResolvedValueOnce({comments:[],cursor:null});await s.page.loadComments();expect(s.page.data.comments).toEqual([]);expect(s.page.data.commentsError).toBe('');
  });
  it('游客点赞只打开明确登录意图，不立即发写请求并保存阅读位置',async()=>{
    const s=await setup(false);s.page.scrollTop=980;s.page.data.draft='未发送';
    await s.page.react({currentTarget:{dataset:{kind:'like'}}});expect(s.social.reaction).not.toHaveBeenCalled();
    expect(fixture.openLogin).toHaveBeenCalledWith(expect.objectContaining({social:expect.objectContaining({intent:{kind:'like',target:true},context:expect.objectContaining({draft:'未发送',scrollTop:980})})}));
  });
  it('草稿空白/超长不提交，Unicode码点300个可提交且显示本人待审',async()=>{
    const s=await setup();s.page.data.draft='  ';await s.page.publishComment();expect(s.social.comment).not.toHaveBeenCalled();
    s.page.data.draft='🙂'.repeat(301);await s.page.publishComment();expect(s.social.comment).not.toHaveBeenCalled();
    s.page.data.draft='🙂'.repeat(300);await s.page.publishComment();expect(s.social.comment).toHaveBeenCalledWith('article','🙂'.repeat(300));expect(s.page.data.draft).toBe('');
  });
  it('服务关闭互动时给出真实原因，不留下无反馈的点赞或送花入口',async()=>{
    const s=await setup();s.page.data.engagement!.writesEnabled=false;
    await s.page.applyReaction('like',true);expect(s.social.reaction).not.toHaveBeenCalled();expect(s.page.data.socialError).toContain('暂未开放');
    await s.page.openGift();expect(s.page.data.socialError).toContain('赠送暂未开放');
    s.page.data.draft='保留的评论';await s.page.publishComment();expect(s.social.comment).not.toHaveBeenCalled();expect(s.page.data.draft).toBe('保留的评论');
  });
  it('评论失败保留原稿；再次打开当前账号可恢复原待确认文本',async()=>{
    const s=await setup();s.page.data.draft='我的回应';s.social.comment.mockRejectedValueOnce(new Error('响应丢失'));
    s.social.hasPending.mockImplementation(key=>key==='comment:article');await s.page.publishComment();expect(s.page.data.draft).toBe('我的回应');expect(s.page.data.commentPending).toBe(true);
    s.social.pendingComment.mockReturnValueOnce('我的回应');s.page.data.draft='';await s.page.refreshSocial();expect(s.page.data.draft).toBe('我的回应');
  });
  it('登录返回评论只恢复草稿与滚动，送花只打开面板，不自动提交',async()=>{
    const s=await setup();const navigation=await import('../miniprogram/social/intent');
    const target=navigation.socialReturn('article','article',{kind:'comment',draft:'保留的评论'},null,0);target.context={draft:'保留的评论',scrollTop:400,sheet:'comments',commentScroll:100};navigation.bindSocialReturn(target,'account',1);
    await s.page.refresh();expect(s.page.data).toMatchObject({sheet:'comments',draft:'保留的评论'});expect(s.social.comment).not.toHaveBeenCalled();expect(s.pageScrollTo).toHaveBeenCalledWith({scrollTop:400,duration:0});
    navigation.bindSocialReturn(navigation.socialReturn('article','article',{kind:'gift'},null,0),'account',1);await s.page.refresh();expect(s.page.data.sheet).toBe('gift');expect(s.social.gift).not.toHaveBeenCalled();
  });
  it('更多→举报的访客登录保留具体评论ID，不发布草稿或直接举报',async()=>{
    const s=await setup(false);s.page.data.draft='未发布';s.page.commentScroll=220;
    await s.page.commentMore({currentTarget:{dataset:{id:'comment'}}});expect(s.social.report).not.toHaveBeenCalled();expect(s.social.comment).not.toHaveBeenCalled();
    expect(fixture.openLogin).toHaveBeenCalledWith(expect.objectContaining({social:expect.objectContaining({intent:{kind:'report',commentId:'comment'},context:expect.objectContaining({commentScroll:220,draft:'未发布'})})}));
  });
  it('第2页评论的举报登录返回会重新核对原分页深度，再恢复目标和滚动',async()=>{
    const s=await setup();const navigation=await import('../miniprogram/social/intent');
    const target=navigation.socialReturn('article','article',{kind:'report',commentId:'second-page'},null,0);
    target.context={draft:'未发送',scrollTop:1000,sheet:'comments',commentScroll:720,commentPages:2};navigation.bindSocialReturn(target,'account',1);
    s.social.comments.mockResolvedValueOnce({comments:[comment],cursor:'opaque-next'}).mockResolvedValueOnce({comments:[{...comment,id:'second-page'}],cursor:null});
    await s.page.refresh();expect(s.social.comments).toHaveBeenLastCalledWith('article',true,'opaque-next');
    expect(s.social.report).toHaveBeenCalledWith('second-page','不友善或攻击他人');expect(s.page.data.draft).toBe('未发送');expect(s.page.data.commentScroll).toBe(720);
  });
  it('重验分页后原举报评论已被隐藏，不使用旧副本继续举报',async()=>{
    const s=await setup();const navigation=await import('../miniprogram/social/intent');
    const target=navigation.socialReturn('article','article',{kind:'report',commentId:'hidden-comment'},null,0);
    target.context={draft:'保留',scrollTop:800,sheet:'comments',commentScroll:400,commentPages:2};navigation.bindSocialReturn(target,'account',1);
    s.social.comments.mockResolvedValueOnce({comments:[comment],cursor:'opaque-next'}).mockResolvedValueOnce({comments:[],cursor:null});
    await s.page.refresh();expect(s.social.report).not.toHaveBeenCalled();expect(s.page.data.socialError).toContain('评论已不可用');expect(s.page.data.draft).toBe('保留');
  });
  it('公开分页里的较早本人评论不因超出本人最新20条窗口失去删除入口',async()=>{
    const s=await setup();
    s.social.comments.mockResolvedValueOnce({comments:[{...comment,id:'older-own',publicAuthorId:'my-public-id'}],cursor:null});
    s.social.engagement.mockResolvedValueOnce({...engagement,ownComments:[{...comment,id:'recent-own',publicAuthorId:'my-public-id',state:'pending',reason:''}]});
    await s.page.refreshSocial();expect(s.page.data.comments.find(c=>c.id==='older-own')?.own).toBe(true);
    await s.page.commentMore({currentTarget:{dataset:{id:'older-own'}}});expect(s.social.deleteComment).toHaveBeenCalledWith('older-own',1);expect(s.social.report).not.toHaveBeenCalled();
  });
  it.each([[360,640,260,56],[360,640,350,56],[390,844,350,88],[430,932,350,88]])('屏幕 %i×%i、键盘 %i 时关闭按钮在胶囊下方且保留评论滚动空间',async(width,height,keyboard,capsuleBottom)=>{
    const s=await setup();
    vi.stubGlobal('wx',{...wx,getWindowInfo:()=>({windowWidth:width,windowHeight:height,statusBarHeight:capsuleBottom-36}),
      getMenuButtonBoundingClientRect:()=>({top:capsuleBottom-32,height:32,bottom:capsuleBottom,left:width-100})});
    s.page.openComments();s.page.keyboard({detail:{height:keyboard}});
    expect(height-keyboard-s.page.data.sheetHeight).toBeGreaterThanOrEqual(capsuleBottom+4);
    expect(s.page.data.scrollHeight).toBeGreaterThanOrEqual(32);
    if(width===360) expect(s.page.data.compactKeyboard).toBe(true);
  });
  it('取消关注确认迟到时不操作新账号或已隐藏的页面',async()=>{
    const s=await setup();s.page.data.engagement!.relationship.active=true;
    const confirm=deferred<{confirm:boolean}>();s.showModal.mockReturnValueOnce(confirm.promise);
    const running=s.page.react({currentTarget:{dataset:{kind:'follow'}}});s.page.onHide();confirm.resolve({confirm:true});await running;expect(s.social.follow).not.toHaveBeenCalled();
  });
  it('已提交赠送的未知回执在文章撤下后仍可核对，不恢复正文',async()=>{
    const s=await setup();s.social.hasPending.mockImplementation(key=>key==='gift:article');s.social.article.mockRejectedValueOnce(Object.assign(new Error('已撤下'),{status:404}));
    await s.page.refresh();expect(s.page.data.giftPending).toBe(true);expect(s.page.data.article).toBeNull();await s.page.sendFlower();
    expect(s.social.gift).toHaveBeenCalledWith('article');expect(s.page.data).toMatchObject({article:null,shareReady:false,giftPending:false,notice:'小花花已送达'});
  });
});
