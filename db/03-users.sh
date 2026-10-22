#!/bin/bash
# Hardening DB: phân quyền tối thiểu (least privilege)
#  - Tài khoản ứng dụng: chỉ SELECT/INSERT/UPDATE/DELETE trên đúng 1 database
#  - Tài khoản exporter: chỉ quyền giám sát, giới hạn số kết nối
set -e
mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" <<EOSQL
REVOKE ALL PRIVILEGES, GRANT OPTION FROM '${MYSQL_USER}'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON \`${MYSQL_DATABASE}\`.* TO '${MYSQL_USER}'@'%';
CREATE USER IF NOT EXISTS 'exporter'@'%' IDENTIFIED BY '${EXPORTER_DB_PASSWORD}' WITH MAX_USER_CONNECTIONS 3;
GRANT PROCESS, REPLICATION CLIENT, SELECT ON *.* TO 'exporter'@'%';
FLUSH PRIVILEGES;
EOSQL
