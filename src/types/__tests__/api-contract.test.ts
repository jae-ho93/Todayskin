import type { components } from '../api.generated';
import type {
  CalendarDayHistory,
  CalendarDiagnosis,
  CalendarProduct,
  CalendarRecommendation,
  CalendarWeather,
  ConsentRecord,
  HistoryEntry,
  NotificationPreferences,
  PatternCorrelation,
  PatternSummary,
  Product,
  Recommendation,
  ScoreSeries,
  SkinPartMetric,
  SkinScoreSnapshot,
  WeatherSnapshot,
} from '../index';

/**
 * R28: 손으로 쓴 `src/types/index.ts`가 백엔드 계약에서 조용히 벗어나지 않게 막는다.
 *
 * CI의 api-contract-drift 잡은 "생성물이 최신인가"만 본다. 그래서 백엔드가 필드를
 * 지우거나 이름을 바꾸면 `api.generated.ts`는 갱신되지만 수기 타입은 그대로 남고,
 * 화면은 없는 필드를 계속 읽는다. 여기서 컴파일 타임에 그 간극을 잡는다.
 *
 * 검사 방향은 한쪽뿐이다 — "수기 타입에만 있는 필드"가 없어야 한다.
 * 반대(서버에만 있는 필드)는 허용한다. 프론트가 아직 안 쓰는 신규 필드를 매번
 * 따라 적게 만들면 계약 검증이 아니라 잡일이 되기 때문이다.
 *
 * 필드 이름만 비교하고 타입까지는 보지 않는다. 수기 쪽이 의도적으로 더 좁기 때문이다
 * (예: 서버 `status: string` ↔ 프론트 `AirStatus`).
 */

type Schemas = components['schemas'];

/** 수기 타입에만 있는 필드 이름. 계약이 맞으면 never. */
type FieldsMissingOnServer<Local, Remote> = Exclude<keyof Local, keyof Remote>;

/** never가 아니면 이 줄에서 컴파일이 깨진다. */
function assertNoExtraFields<T extends never>(): void {
  void 0 as T | undefined;
}

assertNoExtraFields<FieldsMissingOnServer<WeatherSnapshot, Schemas['WeatherSnapshotDto']>>();
assertNoExtraFields<FieldsMissingOnServer<SkinPartMetric, Schemas['SkinPartMetricDto']>>();
assertNoExtraFields<FieldsMissingOnServer<SkinScoreSnapshot, Schemas['SkinScoreSnapshotDto']>>();
assertNoExtraFields<FieldsMissingOnServer<Recommendation, Schemas['RecommendationDto']>>();
assertNoExtraFields<FieldsMissingOnServer<Product, Schemas['ProductDto']>>();
assertNoExtraFields<FieldsMissingOnServer<HistoryEntry, Schemas['HistoryEntryDto']>>();
assertNoExtraFields<FieldsMissingOnServer<ConsentRecord, Schemas['ConsentRecordDto']>>();
assertNoExtraFields<
  FieldsMissingOnServer<NotificationPreferences, Schemas['NotificationPreferenceDto']>
>();
assertNoExtraFields<FieldsMissingOnServer<CalendarWeather, Schemas['CalendarWeatherDto']>>();
assertNoExtraFields<FieldsMissingOnServer<CalendarProduct, Schemas['CalendarProductDto']>>();
assertNoExtraFields<
  FieldsMissingOnServer<CalendarRecommendation, Schemas['CalendarRecommendationDto']>
>();
assertNoExtraFields<FieldsMissingOnServer<CalendarDiagnosis, Schemas['CalendarDiagnosisDto']>>();
assertNoExtraFields<FieldsMissingOnServer<CalendarDayHistory, Schemas['CalendarDayHistoryDto']>>();
assertNoExtraFields<FieldsMissingOnServer<ScoreSeries, Schemas['ScoreSeriesDto']>>();
assertNoExtraFields<FieldsMissingOnServer<PatternCorrelation, Schemas['PatternCorrelationDto']>>();
assertNoExtraFields<FieldsMissingOnServer<PatternSummary, Schemas['PatternSummaryDto']>>();

describe('API 계약 (R28)', () => {
  it('수기 타입에 서버에 없는 필드가 없다', () => {
    // 실제 검증은 위 타입 단언들이 컴파일 타임에 수행한다.
    // 이 테스트는 파일이 typecheck·jest 양쪽 대상에 들어가게 하는 앵커다.
    expect(true).toBe(true);
  });
});
