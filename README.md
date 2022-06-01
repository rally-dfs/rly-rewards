RLY rewards backend designed to be run on AWS elastic beanstalk

## NPM vs yarn

Note we use npm (and package-lock.json) instead of yarn since it seems to work better with EB's node.js environments.

## Types

The types in src/knex-types can be used to templatize the knex calls, e.g.

`const result: LiquidityPool[] = await knex<LiquidityPool>("liquidity_pools")...`

This should be kept up to sync with the db tables/columns that are defined in migrations/

## EB Notes

.ebextensions/source_compile.config is required for EB to build typescript before the server is started

Procfile is what specifies the command to start the webserver

## Running scripts in EB

The /scripts files can be run inside EB but the DB won't work unless you expose the RDS variables before
running it, e.g.

`export $(/opt/elasticbeanstalk/bin/get-config environment | jq -r 'to_entries | .[] | "\(.key)=\(.value)"')`

(You can see an example of this in .platform/hooks/predeploy/migrate.sh which runs `knex migrate:latest` before every
deploy)
