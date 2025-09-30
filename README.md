# Variable Swapper BETA 🔄

If you have imported components from an external library and want to connect the variables to your local library instead, you can use this plugin to automatically swap variables based on names.

⚠️ This plugin works with all types of variables (colors, sizes, typography, border-radius, border-width) and text styles. It matches variables based on names between external and local libraries.

## How to use

1. **Open the plugin** and select a component or component-set you want to analyze
2. **Click "Analyze selected component"** to find variables that can be swapped
3. **See the summary** showing how many variables can be swapped to local variables
4. **Click "Swap all variables"** to connect to local variables
5. 🎉 Now the variables are connected to your local library!

## Features

* **Supports all variable types** - Colors, sizes, typography, border-radius, border-width
* **Text style support** - Also swaps text styles to local versions
* **ComponentSet support** - Analyzes all variants in a component-set
* **Smart matching** - Matches variables based on names between libraries
* **Simple user experience** - Just two clicks to swap all variables

## How to install

1. Download this repository
2. Use "Import plugin from manifest..." in Figma and select `manifest.json`
3. Now you can find the plugin in Figma under Plugins

## Requirements

Your Figma file must have:

* **Local variables** with the same structure as the design system's Figma file
* **Local text styles** with the same names as in ours
* **Components** that use variables from external libraries

## How it works

1. **Analysis**: The plugin goes through all nodes in the selected component and finds variables that are connected to external libraries
2. **Matching**: It matches these variables with local variables based on names
3. **Swapping**: It swaps the connections from external to local variables

## Supported variable types

* **Colors** - `fills`, `strokes`, `fills[0].color`, `strokes[0].color`
* **Sizes** - `width`, `height`, `paddingTop`, `paddingBottom`, etc.
* **Typography** - `fontSize`, `fontFamily`, `fontWeight`, `lineHeight`, etc.
* **Border** - `cornerRadius`, `strokeWeight`
* **Text styles** - Complete text style connections

## Troubleshooting

### Common problems

**If the plugin doesn't find any variables to swap:**
* Check that you have local variables with the same names
* Check that the component actually uses variables (not hardcoded values)
* Check that the variables come from an external library

**If you get error messages during swapping:**

* **"Variable cannot be overridden in instance (not exposed)"** - This happens when a variable is bound inside a base component and not exposed for instance override. Solution: Open the main component and expose the variable/property for instances, or move the binding to a place where it can be overridden.

* **"No local variable found for: [name]"** - There is no local variable with the same name. Solution: Create a local variable with the same name, or check that the name matches.

* **"Could not find node for variable"** - The plugin cannot find the node that uses the variable. This can happen if the component has changed. Solution: Try analyzing the component again.

### Error handling

The plugin groups similar error messages to provide an overview summary. Instead of showing "8× same error message" it shows as "8× [error message]".

Let us know if you find bugs or other problems!

## About

A Figma plugin for automatically swapping variables on imported components to local variables based on name matching.