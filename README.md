# lti-auto-configuration
This repository contains a set of scripts and utility tools to auto provising LTI tools to Canvas.

We developers spend valuable time setting up LTI 1.3 tools in Canvas, we need to create at least one LTI developer key, in some cases API keys, and register the keys in an LTI auth server. Then add the tool to a subaccount to test it or let the testers play with it. And all of that per project and environment.

The intention of the scripts is provide to developers easier ways to create everything needed in a single run, and being able to delete everything that has been created.

To test it locally, first, install the package globally in your system:

```
npm i -g
```

Then you can run the script using:
```
npx lti-auto-configuration -h
```

The -h flag will make the tool to provide information about what commands are supported and what parameters are required.

Example of the create command:
```
npx lti-auto-configuration -c create -cs https://your.phantastic.canvas.url -t your_admin_token -l https://the.shiny.lti.server.url -lu your_lti_server_username -lp your_lti_server_password -p https://your.shiny.proxy.server.url -tt "The tool name, AB#12345" -tr "your-custom-registration-id" -a your_testing_subaccount -f template.json
```
This command will run the following actions
 1. Creates an LTI developer key.
 2. Creates an API developer key.
 3. Enables both developer keys.
 4. Register both keys in the LTI Auth Server.
 5. Adds the external tool to the testing subaccount using the LTI develoker Key from step 1.

IMPORTANT: The create command requires a template file, you have an example for page-design in the folder, customize the template according to your needs putting attention to the required permissions in the scope.

Example of the delete command:
```
npx lti-auto-configuration -c delete -cs https://your.phantastic.canvas.url -t your_admin_token -l https://the.shiny.lti.server.url -lu your_lti_server_username -lp your_lti_server_password -p https://your.shiny.proxy.server.url -d 122010000000000200
```
This command will run the following actions
 1. Deletes the LTI developer key 122010000000000200.
 2. Gets the LTI registration from the LTI Auth Server.
 3. Deletes, if exists, the API developer key if exists in the registration.
 4. Deletes the LTI registration from the LTI Auth Server.

# TODO
 - Many things to do and improve, this is just the first version with many pending stuff.
 - This is only working for page-design and the banner feature.
 - DONE. Accept the tool URL as parameter because right now page-design is hardcoded.
 - DONE. Accept the JSON templates as parameters and move them to the repositories.
 - Release NPX tool in NPM to use it across repositories.

