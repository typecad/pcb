# typeCAD-prompt
> Generate prompts to use typeCAD with AI coding models

## Getting Started

### Prerequisites

- Access to an AI model, [Cursor](https://www.cursor.com/) works well
    - Claude Sonnet 4.0 has been the best performer so far
    
### Installation
Run the following command in a terminal:

```npm i -g @typecad/typecad-prompt```

This will install the package globally.

## Usage

The tool offers three main functions:

### 1. 📦 Reference Design to typeCAD Package
Creates a prompt to turn an IC reference design into a [typeCAD package](https://typecad.net/docs/package/overview). 

**Required files:**
- IC datasheet in PDF or plaintext format
- Image of the circuit's schematic (usually from the datasheet - use a screen-grab tool and include the figure number)

**Output:** A folder containing:
- Datasheet (converted to plaintext format)
- Schematic image
- `prompt.txt` - generated prompt for the AI model
- `llms-full.txt` - typeCAD documentation (downloaded from typecad.net)

### 2. 🧩 Datasheet to typeCAD Component
Creates a prompt to turn a datasheet into a typeCAD component.

**Required files:**
- IC datasheet in PDF or plaintext format

**Output:** A folder containing:
- Datasheet (converted to plaintext format)
- `prompt.txt` - generated component creation prompt for the AI model
- `llms-full.txt` - typeCAD documentation (downloaded from typecad.net)

### 3. ✏️ Datasheet to Text
Simple utility to convert a PDF datasheet into a text file.

**Required files:**
- IC datasheet in PDF format

**Output:** A text file with the same name as the PDF containing the extracted text.

## Running the Tool

Run the following command (preferably in the same directory as your files):

`typecad-prompt`

You'll be prompted to select which function you want to use, then select the appropriate files.

## Using the Prompts

### Reference Design Prompts
Using the prompt will vary depending on the AI model. The following steps are for use within Cursor.

1. Copy the entire directory to the [typeCAD](https://typecad.net/) project to use the package in. It should now be in the [`./hw`](https://typecad.net/docs/project-structure) folder.

2. Open a new Cursor chat (`Ctrl + I`) and drag each file into the chat to make the files available to the AI model. Dragging the folder doesn't work. 

3. Make sure Claude Sonnet 4.0 is selected. Other models will work, but currently (7/8/2025) Sonnet 4.0 is the best performer. Image analysis is required for any model to work with this process. 

4. Type `run prompt.txt as a prompt` and it will get started. 

#### Reference Design Process
This is a multi-step process that will stop and ask for confirmation or clarification.

It will:

1. Look at the schematic and identify the passives and IC, then reference the datasheet for additional information. It will then present a list of what it thinks are the required passives, values, specifications, etc. for confirmation. 
2. Identify optional components like status LEDs, connectors, configurations, etc. and ask to confirm or reject them.
3. Run the typeCAD package creation tool. Cursor will do this in the Chat window and allow you to interact with the console. Choose to create a `Component Package`, then find the IC KiCAD symbol and footprint files, JLC part number, or KiCAD library. Give the package a TypeScript-legal name (no spaces, special characters, etc.) and confirm. A skeleton package will be created.
4. The AI will then start to edit the files created by the package creation tool.
5. At the end of the process, it should provide the code needed to add the package to the typeCAD project. 

### Component Creation Prompts
For component creation prompts:

1. Copy the directory to your typeCAD project's [`./hw`](https://typecad.net/docs/project-structure) folder.
2. Open a new Cursor chat and drag the files into the chat.
3. Make sure Claude Sonnet 4.0 is selected.
4. Type `run prompt.txt as a prompt` and follow the interactive process to create the component.

The component creation process will guide you through analyzing the datasheet, creating the component file using typeCAD tooling, and updating the component with proper pin configurations and electrical specifications.

### Extras
At this point, you can use the Chat window to ask questions about the design. `What is the purpose of C#?`, `Why was the value of R# chosen?`, `Is EN high or LOW to enable the IC?`, `Where is X described in the datasheet?`, etc.

You can also ask it to modify the design. Optional features identified earlier in the process can be added, or any configuration options can be changed.

### KiCAD
Add the code, build, and look at the result in KiCAD. The components should be grouped so you can pull it around, ungroup it, and begin the layout process. Make sure you import the netlist to see the connections between components. 

The components may not have kept their original designators from the schematic. This happens because typeCAD auto-numbers the components. The information is not lost though. Each component should have their original designator along with a short function summary in the `Description` field. View it by selecting the component and pressing `E`. 

Sonnet 4.0 will approximate the layout of the components to the schematic which can be useful for identifying the components, other models may not do this.

## Limitations
- You'll need to add your own `Power` connections. This is not added currently because it is too dependent on the design it will be used in e.g. power from a battery, regulator, USB, multiple grounds, etc.

- If the schematic image is poorly detailed, it will severely limit the accuracy of the AI. Ideally, it will include the figure number from the schematic, passives with values, designators, ratings etc, minimal extraneous components/circuit, with labeled pins and connections. 

## Troubleshooting
- Like any AI, it will sometimes make mistakes. Typing `refer to llms-full.txt` will prompt it to look at the documentation to correct typeCAD-based errors. It will usually arrive at a correct answer, if it doesn't, look at the errors. AI models will often try to call non-existent methods, saying something like `::connect() does not exist` will prompt it to look at the documentation and correct the error.

- If a component is connected improperly, enter `C#/R# is not connected properly` and it will refer to the documentation and try to fix it. 

- the AI will sometimes create a non-standard passive (inductors with a particular footprint are common issues) using footprints that aren't available. This will result in a build error. To fix it, look at what footprint the model chose (ask it for clarification) and add the .kicad_mod file to the `./hw/build/lib/footprints` folder. Alternatively, select a standard passive size in the generated code (or ask the AI to do it). 