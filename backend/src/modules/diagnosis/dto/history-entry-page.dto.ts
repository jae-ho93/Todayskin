import { ApiProperty } from '@nestjs/swagger';
import { CursorPageDto } from '../../../common/pagination/cursor-pagination';
import { HistoryEntryDto } from './history-entry.dto';

/** R28: OpenAPI에 items 타입을 드러내기 위한 구체 페이지 DTO. */
export class HistoryEntryPageDto extends CursorPageDto<HistoryEntryDto> {
  @ApiProperty({ type: [HistoryEntryDto] })
  declare items: HistoryEntryDto[];
}
