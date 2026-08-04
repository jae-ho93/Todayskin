#!/bin/bash
# 컨테이너 초기화 시 dev 외에 test DB를 추가 생성한다.
# 운영 DB는 컨테이너에서 관리하지 않는다.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE DATABASE todayskin_test;
  GRANT ALL PRIVILEGES ON DATABASE todayskin_test TO $POSTGRES_USER;
EOSQL
