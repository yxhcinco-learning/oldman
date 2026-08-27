import { INITIAL_WORKS, articleText, type Work, type Segment, type ChatMessage } from './mock-data';
export type Screen = 'home' | 'editor' | 'segment-edit' | 'chat';
export type InputMode = 'voice' | 'text';
export type VoiceState = 'idle' | 'recording' | 'review';
export type RecordingContext = 'editor' | 'chat' | null;
export type OptimizeSheet = null | 'menu' | 'content' | 'style' | 'format' | 'image' | 'custom' | 'result';

export interface AppState {
  screen: Screen;
  works: Work[];
  currentWorkId: string | null;
  title: string;
  segments: Segment[];
  textDraft: string;
  inputMode: InputMode;
  voiceState: VoiceState;
  pendingVoice: string;
  liveVoice: string;
  recordingElapsed: number;
  recordingContext: RecordingContext;
  editSegmentId: string | null;
  editText: string;
  messages: ChatMessage[];
  aiTyping: boolean;
  optimizeSheet: OptimizeSheet;
  optimizeChoice: string;
  customPrompt: string;
  illustration: string | null;
  previousSegments: Segment[] | null;
  toast: string | null;
}

export type Action =
  | { type: 'patch'; patch: Partial<AppState> }
  | { type: 'new-work' }
  | { type: 'open-work'; work: Work }
  | { type: 'add-segment'; text: string }
  | { type: 'update-segment'; id: string; text: string }
  | { type: 'replace-segments'; segments: Segment[]; previous?: Segment[] | null };

export const initialState: AppState = {
  screen: 'home',
  works: INITIAL_WORKS,
  currentWorkId: null,
  title: '',
  segments: [],
  textDraft: '',
  inputMode: 'voice',
  voiceState: 'idle',
  pendingVoice: '',
  liveVoice: '',
  recordingElapsed: 0,
  recordingContext: null,
  editSegmentId: null,
  editText: '',
  messages: [],
  aiTyping: false,
  optimizeSheet: null,
  optimizeChoice: '',
  customPrompt: '',
  illustration: null,
  previousSegments: null,
  toast: null,
};

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'patch':
      return { ...state, ...action.patch };
    case 'new-work':
      return {
        ...initialState,
        works: state.works,
        screen: 'editor',
        toast: null,
      };
    case 'open-work':
      return {
        ...state,
        screen: 'editor',
        currentWorkId: action.work.id,
        title: action.work.title,
        segments: action.work.segments,
        textDraft: articleText(action.work.segments),
        inputMode: 'voice',
        voiceState: 'idle',
        pendingVoice: '',
        illustration: null,
        previousSegments: null,
      };
    case 'add-segment': {
      const segments = [...state.segments, { id: `voice-${Date.now()}`, text: action.text }];
      return { ...state, segments, textDraft: articleText(segments), pendingVoice: '', liveVoice: '', voiceState: 'idle' };
    }
    case 'update-segment': {
      const segments = state.segments.map((segment) => segment.id === action.id ? { ...segment, text: action.text } : segment);
      return { ...state, segments, textDraft: articleText(segments), screen: 'editor', editSegmentId: null };
    }
    case 'replace-segments':
      return {
        ...state,
        segments: action.segments,
        textDraft: articleText(action.segments),
        previousSegments: action.previous === undefined ? state.previousSegments : action.previous,
      };
    default:
      return state;
  }
}
