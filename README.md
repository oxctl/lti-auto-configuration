# lti-auto-configuration
This contains a set of scripts and utility tools to auto provising LTI tools to Canvas.

We developers spend valuable time setting up LTI 1.3 tools in Canvas, we need to create at least one LTI developer key, in some cases API keys, and register the keys in an LTI auth server. Then add the tool to a subaccount to test it or let the testers play with it. And all of that per project and environment.

The intention of the scripts is provide to developers easier ways to create everything needed in a single run, and being able to delete everything that has been created.

To test it locally, first, install the package globally in your system:

```
npm i -g
```

Or you can also install it in your project:

```
npm i lti-auto-configuration --save-dev
```

Then you can run the script using:
```
npx lti-auto-configuration -h
```

The -h flag will make the tool to provide information about what commands are supported and what parameters are required.

IMPORTANT: The script requires the configuration provided by template files, you have examples for page-design in the examples folder, customize the configuration templates according to your needs putting attention to the required permissions in the scope.

Example of the create command:
```
npx lti-auto-configuration -c -t ./examples/page-design-template.json -s ./examples/setup-template.json -ss ./examples/secrets-template.json
```
This command will run the following actions
 1. Creates an LTI developer key.
 2. Creates an API developer key.
 3. Enables both developer keys.
 4. Register both keys in the LTI Auth Server.
 5. Adds the external tool to the testing subaccount using the LTI develoker Key from step 1.

Example of the delete command:
```
npx lti-auto-configuration -d -t ./examples/page-design-template.json -s ./examples/setup-template.json -ss ./examples/secrets-template.json
```
This command will run the following actions
 1. Gets the LTI registration from the LTI Auth Server by the registration id present in the template file.
 3. Deletes, if exists, the LTI developer key present in the registration by client id.
 3. Deletes, if exists, the API developer key present in the registration by client id.
 4. Deletes the LTI registration from the LTI Auth Server.

## Override properties using the CLI

You can override any configuration present in the templates from the command line interface, use the -X option to override any property.

Example of overriding the canvas URL and Token.
```
npx lti-auto-configuration -c -t ./examples/page-design-template.json -s ./examples/setup-template.json -ss ./examples/secrets-template.json -X "canvas_url=https://new.canvas.url" -X "canvas_token=letTheLightShineIn"
```

Example of setting a different tool title and registration id
```
npx lti-auto-configuration -c -t ./examples/page-design-template.json -s ./examples/setup-template.json -ss ./examples/secrets-template.json -X "lti_tool_title=New tool title" -X "lti_registration_id=custom-registration-id"
```

# Releasing

Releasing newer versions of the package requires to push the package to NPM:

```
npm version patch
npm login
npm publish
```
