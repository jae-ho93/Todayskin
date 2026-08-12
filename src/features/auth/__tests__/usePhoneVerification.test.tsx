import { AppState, Linking } from 'react-native';
import { act } from 'react-test-renderer';
import { api } from '../../../api/client';
import { flush, renderHook } from '../../../test-utils/renderHook';
import { usePhoneVerification } from '../usePhoneVerification';

/**
 * R27: 가입·로그인의 문자 인증은 실패 비용이 큰데(가입 자체가 막힌다) 상태가 여섯 개로
 * 흩어져 있어 테스트가 없었다. 훅으로 묶으면서 단계 전이를 고정한다.
 */

const otpResponse = {
  code: '123456',
  recipientNumber: '01012345678',
  message: '인증번호를 보냈어요',
};

function setup(onError = jest.fn(), onVerified = jest.fn()) {
  const rendered = renderHook(() =>
    usePhoneVerification({ purpose: 'signup', onError, onVerified }),
  );
  return { ...rendered, onError, onVerified };
}

beforeEach(() => {
  jest.spyOn(api, 'sendOtp').mockResolvedValue(otpResponse);
  jest.spyOn(api, 'verifyOtp').mockResolvedValue(undefined as never);
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('usePhoneVerification', () => {
  it('코드를 받으면 sent 단계로 가고 코드·수신번호를 들고 있는다', async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.sendCode('01012345678');
    });

    expect(result.current.state).toEqual({
      step: 'sent',
      code: '123456',
      recipient: '01012345678',
    });
    expect(result.current.codeIssued).toBe(true);
  });

  it('발송이 실패하면 idle로 돌아가고 오류를 알린다', async () => {
    jest.spyOn(api, 'sendOtp').mockRejectedValue(new Error('발송 실패'));
    const { result, onError } = setup();

    await act(async () => {
      await result.current.sendCode('01012345678');
    });

    expect(result.current.state.step).toBe('idle');
    expect(onError).toHaveBeenCalledWith('발송 실패');
  });

  it('검증에 성공하면 verified로 가고 완료를 알린다', async () => {
    const { result, onVerified } = setup();

    await act(async () => {
      await result.current.sendCode('01012345678');
    });
    await act(async () => {
      await result.current.verify();
    });

    expect(result.current.verified).toBe(true);
    expect(onVerified).toHaveBeenCalled();
    expect(api.verifyOtp).toHaveBeenCalledWith('01012345678', '123456', 'signup');
  });

  it('검증에 실패하면 sent로 되돌아가 다시 시도할 수 있다', async () => {
    jest.spyOn(api, 'verifyOtp').mockRejectedValue(new Error('코드가 달라요'));
    const { result, onError } = setup();

    await act(async () => {
      await result.current.sendCode('01012345678');
    });
    await act(async () => {
      await result.current.verify();
    });

    expect(result.current.state.step).toBe('sent');
    expect(result.current.verified).toBe(false);
    expect(onError).toHaveBeenCalledWith('코드가 달라요');
  });

  it('번호를 바꾸면(reset) 이전 인증이 무효가 된다', async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.sendCode('01012345678');
    });
    act(() => {
      result.current.reset();
    });

    expect(result.current.state).toEqual({ step: 'idle' });
    expect(result.current.codeIssued).toBe(false);
  });

  // F34: 문자 앱을 연 뒤 돌아왔을 때만 자동 검증한다.
  it('문자 앱을 열고 복귀하면 자동으로 검증한다', async () => {
    let appStateHandler: ((state: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
      appStateHandler = handler as (state: string) => void;
      return { remove: jest.fn() } as never;
    });
    const { result } = setup();

    await act(async () => {
      await result.current.sendCode('01012345678');
    });
    await act(async () => {
      await result.current.openSms();
    });
    act(() => {
      appStateHandler?.('active');
    });
    await flush();

    expect(result.current.verified).toBe(true);
  });

  it('문자 앱을 열지 않았으면 복귀해도 검증하지 않는다', async () => {
    let appStateHandler: ((state: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
      appStateHandler = handler as (state: string) => void;
      return { remove: jest.fn() } as never;
    });
    const { result } = setup();

    await act(async () => {
      await result.current.sendCode('01012345678');
    });
    act(() => {
      appStateHandler?.('active');
    });
    await flush();

    expect(api.verifyOtp).not.toHaveBeenCalled();
  });
});
