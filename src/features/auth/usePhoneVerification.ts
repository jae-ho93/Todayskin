import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, Linking, Platform } from 'react-native';
import { api } from '../../api/client';
import type { OtpPurpose } from '../../types';

/**
 * 휴대폰 인증 한 건의 진행 상태.
 *
 * 전에는 화면이 `otpSent`/`otpCode`/`recipientNumber`/`phoneVerified`/`sendingOtp`/
 * `verifyingOtp` 여섯 개를 따로 들고 있었다. "발송 중인데 이미 인증됨" 같은 불가능한
 * 조합이 표현 가능했고, 번호를 고칠 때 여섯 개를 모두 되돌려야 했다.
 */
export type PhoneVerificationState =
  | { step: 'idle' }
  | { step: 'sending' }
  | { step: 'sent'; code: string; recipient: string }
  | { step: 'verifying'; code: string; recipient: string }
  | { step: 'verified'; code: string; recipient: string };

interface UsePhoneVerificationOptions {
  purpose: OtpPurpose;
  /** 발송·검증 실패 메시지. 화면이 자기 에러 표시 방식(문구/토스트)을 정한다. */
  onError: (message: string) => void;
  onVerified?: () => void;
}

/**
 * R27: 문자 인증 흐름(코드 발송 → 문자 앱 → 복귀 자동 검증)을 한 곳에 모은다.
 *
 * F34: 사용자가 문자를 보낸 뒤 앱으로 돌아오는 순간을 잡아 자동으로 검증한다.
 * 이 타이밍 처리는 화면 코드에 두면 리스너 정리를 빠뜨리기 쉬워서 훅에 가둔다.
 */
export function usePhoneVerification({
  purpose,
  onError,
  onVerified,
}: UsePhoneVerificationOptions) {
  const [state, setState] = useState<PhoneVerificationState>({ step: 'idle' });
  const phoneRef = useRef('');
  // F34: 문자 앱을 연 뒤 복귀했을 때만 자동 검증한다.
  const smsOpenedRef = useRef(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onVerifiedRef = useRef(onVerified);
  onVerifiedRef.current = onVerified;

  /** 번호를 바꾸면 이전 인증은 무효 — 새 번호로 다시 받아야 한다. */
  const reset = useCallback(() => {
    smsOpenedRef.current = false;
    setState({ step: 'idle' });
  }, []);

  const sendCode = useCallback(
    async (phoneDigits: string) => {
      setState((prev) => (prev.step === 'sending' ? prev : { step: 'sending' }));
      phoneRef.current = phoneDigits;
      try {
        const response = await api.sendOtp(phoneDigits, purpose);
        setState({
          step: 'sent',
          code: response.code,
          recipient: response.recipientNumber,
        });
      } catch (e) {
        setState({ step: 'idle' });
        onErrorRef.current(
          e instanceof Error ? e.message : '인증번호 발송에 실패했습니다.',
        );
      }
    },
    [purpose],
  );

  const openSms = useCallback(async () => {
    if (state.step === 'idle' || state.step === 'sending') return;
    try {
      smsOpenedRef.current = true;
      // iOS는 `?body=` 대신 `&body=`를 요구한다 — 문자 시트가 본문 채워진 채 열린다.
      const sep = Platform.OS === 'ios' ? '&' : '?';
      await Linking.openURL(
        `sms:${state.recipient}${sep}body=${encodeURIComponent(`인증코드 ${state.code}`)}`,
      );
    } catch {
      onErrorRef.current('문자 앱을 열 수 없어요. 다시 시도해주세요.');
    }
  }, [state]);

  const verify = useCallback(async () => {
    if (state.step !== 'sent' || state.code.length !== 6) return;
    const { code, recipient } = state;
    setState({ step: 'verifying', code, recipient });
    try {
      await api.verifyOtp(phoneRef.current, code, purpose);
      setState({ step: 'verified', code, recipient });
      Keyboard.dismiss();
      onVerifiedRef.current?.();
    } catch (e) {
      setState({ step: 'sent', code, recipient });
      onErrorRef.current(
        e instanceof Error ? e.message : '인증을 확인하지 못했어요. 다시 시도해주세요.',
      );
    }
  }, [state, purpose]);

  // F34: 문자 앱에서 복귀하면 자동으로 인증을 확인한다.
  const verifyRef = useRef(verify);
  verifyRef.current = verify;
  useEffect(() => {
    if (state.step !== 'sent') return;
    const subscription = AppState.addEventListener('change', (appState) => {
      if (appState === 'active' && smsOpenedRef.current) {
        void verifyRef.current();
      }
    });
    return () => subscription.remove();
  }, [state.step]);

  return {
    state,
    verified: state.step === 'verified',
    /** 코드를 받은 뒤(문자 발송 가능) */
    codeIssued: state.step !== 'idle' && state.step !== 'sending',
    sending: state.step === 'sending',
    verifying: state.step === 'verifying',
    sendCode,
    openSms,
    verify,
    reset,
  };
}
