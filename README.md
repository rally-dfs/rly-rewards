RLY rewards backend designed to be run on AWS elastic beanstalk

.ebextensions/source_compile.config is required for EB to build typescript before the server is started

Procfile is what specifies the command to start the webserver

Note we use npm (and package-lock.json) instead of yarn since it seems to work better with EB's node.js environments.
