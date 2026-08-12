import { JobType } from './enums/job-type.enum';
import { buildJobDedupeKey, jobDedupeKeyOf } from './job-dedupe';

describe('job dedupe key (R10)', () => {
  it('추천 생성은 diagnosisId로 키를 만든다', () => {
    expect(
      buildJobDedupeKey(JobType.RECOMMENDATION_GENERATE, { diagnosisId: 'diag-1' }),
    ).toBe('diagnosisId:diag-1');
  });

  it('날씨 제품 생성은 regionKey로 키를 만든다', () => {
    expect(
      buildJobDedupeKey(JobType.WEATHER_PRODUCTS_GENERATE, { regionKey: '서울특별시' }),
    ).toBe('regionKey:서울특별시');
  });

  it('쓰기와 조회가 같은 형식을 만든다 (dedupe 조용한 실패 방지)', () => {
    expect(buildJobDedupeKey(JobType.RECOMMENDATION_GENERATE, { diagnosisId: 'd' })).toBe(
      jobDedupeKeyOf('diagnosisId', 'd'),
    );
  });

  it('dedupe 대상이 없는 job 종류는 null', () => {
    expect(buildJobDedupeKey(JobType.PATTERN_ANALYZE, { userId: 1 })).toBeNull();
    expect(buildJobDedupeKey(JobType.NOTIFICATION_SEND, { title: 'x' })).toBeNull();
  });

  it('키가 될 값이 없으면 null — dedupe 없이 매번 새 job (호환 경로)', () => {
    expect(buildJobDedupeKey(JobType.RECOMMENDATION_GENERATE, {})).toBeNull();
    expect(buildJobDedupeKey(JobType.RECOMMENDATION_GENERATE, null)).toBeNull();
    expect(
      buildJobDedupeKey(JobType.RECOMMENDATION_GENERATE, { skinScore: {}, weather: {} }),
    ).toBeNull();
  });

  it('문자열이 아니거나 빈 값은 키로 쓰지 않는다', () => {
    expect(buildJobDedupeKey(JobType.RECOMMENDATION_GENERATE, { diagnosisId: '' })).toBeNull();
    expect(buildJobDedupeKey(JobType.RECOMMENDATION_GENERATE, { diagnosisId: 7 })).toBeNull();
    expect(
      buildJobDedupeKey(JobType.RECOMMENDATION_GENERATE, { diagnosisId: null }),
    ).toBeNull();
  });
});
