import { Type, applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';

/**
 * R28: cursor 페이지네이션 엔드포인트의 응답을 OpenAPI에 기술한다.
 *
 * 이 엔드포인트들은 `cursor`/`limit` 없이 호출하면 배열을, 있으면 페이지 객체를
 * 돌려주는 하위호환 계약이다. 생성 타입에도 그 union이 그대로 드러나야
 * 프론트가 두 형태를 모두 다루도록 강제된다.
 */
export function ApiArrayOrCursorPage(
  itemDto: Type<unknown>,
  pageDto: Type<unknown>,
) {
  return applyDecorators(
    ApiExtraModels(itemDto, pageDto),
    ApiOkResponse({
      schema: {
        oneOf: [
          { type: 'array', items: { $ref: getSchemaPath(itemDto) } },
          { $ref: getSchemaPath(pageDto) },
        ],
      },
    }),
  );
}
