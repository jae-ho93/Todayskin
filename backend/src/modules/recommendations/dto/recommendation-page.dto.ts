import { ApiProperty } from '@nestjs/swagger';
import { CursorPageDto } from '../../../common/pagination/cursor-pagination';
import { RecommendationDto } from './recommendation.dto';

/** R28: OpenAPI에 items 타입을 드러내기 위한 구체 페이지 DTO. */
export class RecommendationPageDto extends CursorPageDto<RecommendationDto> {
  @ApiProperty({ type: [RecommendationDto] })
  declare items: RecommendationDto[];
}
