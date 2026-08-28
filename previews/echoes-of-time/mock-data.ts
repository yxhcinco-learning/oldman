export type CoverTone = 'amber' | 'sage' | 'blue' | 'rose';

export interface Segment {
  id: string;
  text: string;
}

export interface Work {
  id: string;
  mark: string;
  tone: CoverTone;
  title: string;
  meta: string;
  status: string;
  segments: Segment[];
}

export interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  text: string;
}

export const INITIAL_WORKS: Work[] = [
  {
    id: 'bike', mark: '家', tone: 'amber', title: '父亲的那辆二八自行车', meta: '昨天 13:01', status: '还想再说一点',
    segments: [
      { id: 'bike-1', text: '父亲有一辆黑色的二八自行车。小时候，我总坐在前面的横梁上，他骑车带我去赶集。' },
      { id: 'bike-2', text: '车铃一响，我就知道父亲回来了。许多年过去，那清脆的声音还留在我的记忆里。' },
    ],
  },
  {
    id: 'flower', mark: '香', tone: 'sage', title: '院子里的桂花树', meta: '昨天 10:01', status: '整理中',
    segments: [
      { id: 'flower-1', text: '老屋的院角有一棵桂花树，是母亲亲手种下的。每到秋天，整条巷子都是甜甜的香气。' },
      { id: 'flower-2', text: '我们把落下来的桂花收在竹匾里，母亲会做一小罐桂花蜜，留到冬天慢慢吃。' },
    ],
  },
  {
    id: 'train', mark: '路', tone: 'blue', title: '第一次坐绿皮火车', meta: '7月25日 10:01', status: '已完成',
    segments: [
      { id: 'train-1', text: '我十六岁那年，响应号召，从上海坐火车到黑龙江。那是我第一次离家，也是第一次坐那么远的火车。' },
      { id: 'train-2', text: '火车走了三天两夜。车窗外从江南的水田，慢慢变成望不到边的黑土地。' },
      { id: 'train-3', text: '同行的年轻人一路唱歌，我嘴上跟着笑，心里却一直想着送我上车的母亲。' },
    ],
  },
];

export const VOICE_PHRASES = [
  '我十六岁那年，响应号召，从上海坐火车到黑龙江。',
  '那趟车坐了三天两夜，车窗外的景色一直在变。',
  '同行的年轻人有说有笑，我心里却又期待又舍不得家。',
  '母亲送我到车站，还悄悄往包里塞了六个煮鸡蛋。',
];

export const CHAT_USER_PHRASES = [
  '我叫陈桂芳，那一年刚满十六岁。',
  '最难忘的是母亲往我包里塞了六个煮鸡蛋。',
  '后来到了北大荒，第一场雪下得特别早。',
];

export const CHAT_REPLIES = [
  '陈阿姨您好，我记住了：十六岁的您，第一次独自去往遥远的北方。离开上海的那一天，谁来车站送您了？',
  '六个煮鸡蛋，是母亲没说出口的牵挂。您在火车上第一次打开包时，心里是什么滋味？',
  '那场早雪一定很难忘。您还记得雪落下来时，身边有哪些人、大家说了什么吗？',
];

export const CONTENT_TYPES = ['回忆录', '生活随笔', '亲情故事', '口述故事'];
export const WRITING_STYLES = ['朴实真诚', '温暖叙事', '文学散文', '轻松幽默'];
export const FORMAT_OPTIONS = ['自动分段', '修正标点', '添加小标题'];
export const CUSTOM_PROMPTS = ['写得更温暖', '保留我的口吻', '不要太文绉绉'];

export function articleText(segments: Segment[]) {
  return segments.map((segment) => segment.text.trim()).filter(Boolean).join('\n\n');
}

export function countWords(segments: Segment[]) {
  return segments.reduce((total, segment) => total + segment.text.replace(/\s/g, '').length, 0);
}

export function splitDraft(text: string): Segment[] {
  return text
    .split(/\n\s*\n|\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, index) => ({ id: `text-${Date.now()}-${index}`, text: part }));
}

export function buildChatIntro(segments: Segment[]): ChatMessage[] {
  const hasContent = segments.some((segment) => segment.text.trim());
  if (!hasContent) {
    return [
      { id: 'intro-1', role: 'assistant', text: '您好，我是写作助理小文。我会陪您慢慢回忆，再把说过的话整理成文章。' },
      { id: 'intro-2', role: 'assistant', text: '我们从简单的开始：您今天最想写起哪一段往事？' },
    ];
  }
  return [
    { id: 'intro-1', role: 'assistant', text: '我读完了前面的内容：这是一个十六岁第一次离家，坐着绿皮火车去往北方的故事。期待、忐忑，还有对母亲的不舍，都很动人。' },
    { id: 'intro-2', role: 'assistant', text: '您好，我是写作助理小文。接下来我会一次只问一个问题，陪您把细节慢慢想起来。' },
    { id: 'intro-3', role: 'assistant', text: '先简单介绍一下当时的自己，好吗？比如您的名字和那时的年纪。' },
  ];
}

export function organizeChatIntoSegments(messages: ChatMessage[]): Segment[] {
  const answerCount = messages.filter((message) => message.role === 'user').length;
  if (!answerCount) return [];

  const organized = [
    '那一年我叫陈桂芳，刚满十六岁。第一次独自去往遥远的北方，心里既有期待，也有对家的不舍。',
    '母亲来车站送我。临上车前，她没有说太多话，只是悄悄往我的布包里塞了六个煮鸡蛋。后来打开包时，我才明白，那沉甸甸的分量里装的都是牵挂。',
    '到了北大荒以后，第一场雪比想象中来得更早。雪花落在陌生的土地上，我和同行的年轻人站在门口看了很久，那一刻才真正意识到，新的生活已经开始了。',
  ];

  return organized.slice(0, answerCount).map((text, index) => ({
    id: `chat-organized-${Date.now()}-${index}`,
    text,
  }));
}

export function optimizedSegments(source: Segment[]): Segment[] {
  if (!source.length) return source;
  return [
    { id: `optimized-${Date.now()}-1`, text: '我十六岁那年，第一次离开上海，坐上一列开往黑龙江的绿皮火车。汽笛响起时，我还没有真正明白，这一走，故乡就到了千里之外。' },
    { id: `optimized-${Date.now()}-2`, text: '火车整整走了三天两夜。窗外的景色一天天变着：江南的水田退到身后，取而代之的是望不到边的黑土地。同行的年轻人一路唱着歌，笑声把车厢塞得满满当当。' },
    { id: `optimized-${Date.now()}-3`, text: '我也跟着大家笑，手却一直攥着母亲塞进包里的六个煮鸡蛋。那时我才知道，舍不得说出口的话，原来都可以藏在一个沉甸甸的布包里。' },
  ];
}
