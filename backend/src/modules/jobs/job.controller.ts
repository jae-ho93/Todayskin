import {
  Controller,
  Get,
  MessageEvent,
  NotFoundException,
  Param,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Observable, interval, map, startWith, switchMap, takeWhile } from 'rxjs';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/strategies/jwt.strategy';
import { JobService } from './job.service';
import { JobResponseDto } from './dto/job-response.dto';
import { JobStatus } from './enums/job-status.enum';

/**
 * JobController — polling + SSE로 비동기 job 상태/결과를 조회한다.
 */
@ApiTags('jobs')
@Controller('jobs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class JobController {
  constructor(private readonly jobService: JobService) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Job 상태 조회 (polling)',
    description:
      'PENDING → COMPLETED/FAILED. COMPLETED면 result, FAILED면 error를 포함한다. 본인 job만 조회 가능.',
  })
  async getById(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<JobResponseDto> {
    return this.jobService.getForUser(id, user.sub);
  }

  @Sse(':id/events')
  @ApiOperation({
    summary: 'Job 상태 SSE 스트림',
    description:
      '1초 간격으로 job 상태를 push한다. COMPLETED/FAILED가 되면 스트림을 종료한다.',
  })
  streamEvents(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Observable<MessageEvent> {
    return interval(1_000).pipe(
      startWith(0),
      switchMap(async () => {
        try {
          return await this.jobService.getForUser(id, user.sub);
        } catch (e) {
          if (e instanceof NotFoundException) {
            throw e;
          }
          throw e;
        }
      }),
      map((job) => ({ data: job }) as MessageEvent),
      takeWhile(
        (event) => (event.data as JobResponseDto).status === JobStatus.PENDING,
        true,
      ),
    );
  }
}
