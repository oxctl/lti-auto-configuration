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

Pass an alternative profile name to the `init` command to set up a different profile for working with different servers:

```bash
npx @oxctl/lti-auto-configuration init prod
```

Then when running any of the other commands select to use that profile with `NODE_ENV=prod npx @oxctl/....`


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

## Validate Tool Configuration

If you have previously deployed a tool then it can be helpful to check that the configuration is still in-place. This is especially useful where tools are deployed to Canvas instances that get reset regularly (eg beta/test).

```bash
npx @oxctl/lti-auto-configuration validate
```

This command will run the following actions

1. Gets the LTI registration from tool support by the registration id.
2. Check if the LTI developer key present in the registration by client id.
3. Check if the API developer key present in the registration by client id.

## Export Tool Configuration

If you have previously deployed a tool then it can be helpful to export the configuration to a file. This can be useful
when making small changes to an existing tool configuration, or for backing up the configuration.
```bash
npx @oxctl/lti-auto-configuration export
```

This command will run the following actions

1. Gets the LTI registration from tool support by the registration.
2. Get the LTI Key configuration from Canvas.
3. Get the API Key configuration from Canvas (if configured).
4. Write out the complete configuration as one blob of JSON.

## List Registration IDs 

When multiple tools are deployed you might not know the registration ID you want to edit. This command lists all the
registrations installed on a tool support server

```bash
npx @oxctl/lti-auto-configuration list
```

This command will run the following actions

1. Gets the all LTI registration from tool support. 
2. Output the registration IDs for the registrations.

## Override properties using the CLI

You can override any configuration present in the templates from the command line interface, pass the `NODE_CONFIG` environmental variable:

Example of overriding the canvas URL and Token.

```bash
NODE_CONFIG='{"canvas_url": "https://new.canvas.url", "canvas_token": "letTheLightShineIn"}' npx @oxctl/lti-auto-configuration create
```

You can also pass additional configuration on the command line with:

```bash
 NODE_CONFIG='{"lti_registration_id": "oxford-cm-dev"}' npx @oxctl/lti-auto-configuration export
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
organization and have permissions to push packages. Github Actions with automatically publish a tag to npmjs.com.
Bumping up the version with `npm version` and pushing those changes should result in a new release being published.

```
npm version patch
git push && git push --tags
```

# Notes

## Disabling adding tool to sub-account

If you don't want a tool to be added to a sub-account you can set the `canvas_account_id` configuration to `none`. This can be useful when initially releasing a tool to a production instance and you wish to have more control over when end users see it.
## Automatic Variables

The following variables are automatically set by the tool and can be used in the configuration:

 - `canvas_provider_url` - The URL of the LTI 1.3 initation endpoint for the Canvas instance.
 - `lti_dev_id` - The LTI developer key Client ID.
 - `lti_dev_key` - The LTI developer key Client secret.
 - `api_dev_id` - The API developer key Client ID.
 - `api_dev_key` - The API developer key Client secret.