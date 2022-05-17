#!/bin/bash

echo "Migrating predeploy"

echo $PWD

# need this to set RDS_FOO variables in env for knex 
export $(/opt/elasticbeanstalk/bin/get-config environment | jq -r 'to_entries | .[] | "\(.key)=\(.value)"')

RDS_DB_NAME=${RDS_DB_NAME} \
RDS_HOSTNAME=${RDS_HOSTNAME} \
RDS_USERNAME=${RDS_USERNAME} \
RDS_PASSWORD=${RDS_PASSWORD} \
./node_modules/.bin/knex migrate:latest --env production