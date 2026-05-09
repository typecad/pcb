# Tooling

**type**CAD provides a collection of tools to make the development process easier.

## Project Creation
To create a new project enter the following command in your terminal:

```bash
npx @typecad/create-typecad
```

The first time, `npx` will ask you to download the script so it can run it. 

Then you'll be prompted to enter project details:
- name for the project
- if you want to create a PlatformIO project and if so, the [board ID](https://docs.platformio.org/en/latest/boards/index.html)
- if you want to create a `git` repository
- install optional utility packages

A project will be created in the current directory. Inside the project directory, there will be a VSCode `workspace` file that will open the project in VSCode.

### Non-interactive mode
All the information can be passed by command-line arguments and the script will automatically create a project. `--help` will show all the parameters.

```bash
npx @typecad/create-typecad --name=typecad_project --git=false --pio=false
```

The above is the minimum to run automatically. 

--- 

### Project Use
A **type**CAD project is just an npm package. All the normal npm-based tools are available to you. A `package.json` file is created with access to the following scripts:
- Project Building
- Adding Components
- Opening the `kicad_pcb` file in KiCAD

> [!tip]
> In VSCode, there's a sidebar that allows you to just click the various scripts to run them

### Project Building
Click the `Build` script in VSCode's `NPM Scripts` sidebar. 

To build the project in a terminal, run the following command:

```bash
npx tsx [path/to/file.ts]
```

The outputs will be in `./build/`.

## Adding Components
Components are discussed in the [Components](/docs/components) page. But for now, they are anything with a footprint that you'd add to your PCB like MCUs and resistors.

To add a component to the project:

```bash
npx @typecad/add-component --folder=./src
```

When the script runs, you'll be asked the source for the symbol and footprint files. You can mix any of the sources ie. a KiCAD symbol, but a local file. 
- If it's a KiCAD library component, you'll be prompted to enter the symbol and footprint names
- If it's a local file, you'll be prompted to enter the path to the file
- If it's an EasyEDA/JLCPCB component, you'll be asked for the `C###` number

A `[component].ts` file will be generated along with instructions on how to use it. Files will also be copied into the `./build/` directory.

### Non-interactive mode
All the information can be passed by command-line arguments and the script will automatically create a component. `--help` will show all the parameters.

```bash
  npx @typecad/add-component --symbol_source=kicad --footprint_source=local --symbol=MCU_Microchip_ATtiny:ATtiny3227-M --footprint=MyLib:MyFootprint
  
  npx @typecad/add-component --symbol_source=jlcpcb --footprint_source=kicad --c=C3217148 --footprint=Package_QFN:QFN-32-1EP_5x5mm_P0.5mm_EP3.45x3.45mm
```

The above is the minimum to run automatically.

> [!important]
> There's no need to add passives (resistors, capacitors etc.) this way. See the  [Passives](/docs/passives) page for more information.

## Package Creation
typeCAD has a command-line tool to generate all the boilerplate code for a package. It sets up the package for easy publishing and reuse. It is discussed in more detail in the [Package Overview](/docs/package/overview) page.

Execute the following command in `./hw` of an already existing **type**CAD project.

```bash
npx @typecad/add-package --folder=./src
```

       Project Structure