import { prepareUploadImage, resizeTarget, UPLOAD_MAX_EDGE } from '../upload-image';

// expo-image-manipulator는 네이티브 모듈이라 인메모리 목으로 대체한다.
const mockSaveAsync = jest.fn();
const mockRenderAsync = jest.fn();
const mockResize = jest.fn();
const mockManipulate = jest.fn();

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: (...args: unknown[]) => mockManipulate(...args),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockManipulate.mockReturnValue({ resize: mockResize, renderAsync: mockRenderAsync });
  mockRenderAsync.mockResolvedValue({ saveAsync: mockSaveAsync });
  mockSaveAsync.mockResolvedValue({ uri: 'file://resized.jpg', width: 1440, height: 1920 });
});

describe('resizeTarget (F72)', () => {
  it('가로가 긴 큰 이미지는 width를 상한으로 잡는다', () => {
    expect(resizeTarget(4000, 3000)).toEqual({ width: UPLOAD_MAX_EDGE, height: null });
  });

  it('세로가 긴 큰 이미지는 height를 상한으로 잡는다', () => {
    expect(resizeTarget(3000, 4000)).toEqual({ width: null, height: UPLOAD_MAX_EDGE });
  });

  it('정사각 큰 이미지는 width 기준으로 줄인다', () => {
    expect(resizeTarget(2000, 2000)).toEqual({ width: UPLOAD_MAX_EDGE, height: null });
  });

  it('장변이 상한과 같거나 작으면 리사이즈하지 않는다 (업스케일 금지)', () => {
    expect(resizeTarget(1440, 1080)).toBeNull();
    expect(resizeTarget(720, 960)).toBeNull();
  });

  it('크기를 모르거나 0 이하이면 리사이즈하지 않는다', () => {
    expect(resizeTarget(undefined, 4000)).toBeNull();
    expect(resizeTarget(4000, undefined)).toBeNull();
    expect(resizeTarget(0, 4000)).toBeNull();
    expect(resizeTarget(-1, 4000)).toBeNull();
  });
});

describe('prepareUploadImage (F72)', () => {
  it('큰 이미지는 리사이즈 결과 URI를 돌려준다', async () => {
    const uri = await prepareUploadImage('file://origin.jpg', 3024, 4032);
    expect(mockManipulate).toHaveBeenCalledWith('file://origin.jpg');
    expect(mockResize).toHaveBeenCalledWith({ width: null, height: UPLOAD_MAX_EDGE });
    expect(mockSaveAsync).toHaveBeenCalledWith({ compress: 0.8, format: 'jpeg' });
    expect(uri).toBe('file://resized.jpg');
  });

  it('작은 이미지는 매니퓰레이터를 호출하지 않고 원본을 돌려준다', async () => {
    const uri = await prepareUploadImage('file://origin.jpg', 1080, 1440);
    expect(mockManipulate).not.toHaveBeenCalled();
    expect(uri).toBe('file://origin.jpg');
  });

  it('리사이즈 실패 시 원본 URI로 폴백한다 (분석이 막히면 안 됨)', async () => {
    mockRenderAsync.mockRejectedValueOnce(new Error('render fail'));
    const uri = await prepareUploadImage('file://origin.jpg', 3024, 4032);
    expect(uri).toBe('file://origin.jpg');
  });
});
