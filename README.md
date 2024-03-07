# lti-auto-configuration

This contains a set of scripts and utility tools to auto provising LTI tools to Canvas.

We developers spend valuable time setting up LTI 1.3 tools in Canvas, we need to create at least one LTI developer key,
in some cases API keys, and register the keys in an LTI auth server. Then add the tool to a subaccount to test it or let
the testers play with it. And all of that per project and environment.

The intention of the scripts is to provide developers an easier way to create everything needed in a single run, and
being able to delete everything that has been created.

To test it locally, first, install the package globally in your system:

```
npm i -g
```

Or you can also install it in your project:

```
npm i @oxctl/lti-auto-configuration --save-dev
```

Then you can run the script using:

```
npx @oxctl/lti-auto-configuration -h
```

The -h flag will output information about what commands are supported and what parameters are required.

IMPORTANT: The script requires the configuration provided by template files, you have examples for page-design in the
`tool-config` folder, customize the configuration templates according to your needs putting attention to the required
permissions in the scope.

## Initialisation

This tool stores configuration in `~/.tool-config` under profiles. This allows you to easily switch between different
servers.

To initialise things under the `default` environment run:

```bash
npx @oxctl/lti-auto-configuration init
```

This will prompt for the URL and credentials for Canvas and Tool Support.

## Setup

If the tool has additional configuration it needs to prompt for then these values can be set with:

```bash
npx @oxctl/lti-auto-configuration setup
```

## Add Tool

Now the configuration can be used to add a tool (using example template in `tool-config`):

```bash
npx @oxctl/lti-auto-configuration create
```

This command will run the following actions:

1. Creates an LTI developer key.
2. Creates an API developer key.
3. Enables both developer keys.
4. Register both keys in the LTI Auth Server.
5. Adds the external tool to the testing sub-account using the LTI developer Key from step 1.

## Update Tool

After you have created the tool if you edit the tool configuration you can update it in Canvas and Tool Support with:

```bash
npx @oxctl/lti-auto-configuration update
```

This command will:

1. Lookup configuration in tool support for the registration ID.
2. Update the LTI developer key.
3. Update the API developer key (adding if needed and deleting if no longer required).
4. Update the configuration in tool support.

## Remove Tool

Once you no longer need to the tool you can remove it with:

```bash
npx @oxctl/lti-auto-configuration delete
```

This command will run the following actions

1. Gets the LTI registration from tool support by the registration id.
3. Deletes, if exists, the LTI developer key present in the registration by client id.
3. Deletes, if exists, the API developer key present in the registration by client id.
4. Deletes the LTI registration from the LTI Auth Server.

## Override properties using the CLI

You can override any configuration present in the templates from the command line interface, pass the `NODE_CONFIG` environmental variable:

Example of overriding the canvas URL and Token.

```bash
NODE_CONFIG='{"canvas_url": "https://new.canvas.url", "canvas_token": "letTheLightShineIn"}' npx @oxctl/lti-auto-configuration create
```

# Troubleshooting

If you get a message back of `Error: Untrusted certificate in chain` then you are probably using a self signed
certificate
for one of the endpoints. You can trust additional certificates with node by using the `NODE_EXTRA_CA_CERTS`
environmental
variable. If you're using `mkcert` then you can add those to the trusted list with:

```bash
export NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem"
```

# Releasing

Releasing newer versions of the package requires to push the package to NPM, you have to be member of the OXCTL
organization and have permissions to push packages.

First, edit the 'bin/index.js' file and bump the version, then commit the result.

```
git checkout main
# edit bin/index.js
git add bin/index.js
git commit -m "Version bump"
npm version patch
git push && git push --tags
npm login
npm publish --access public
```
