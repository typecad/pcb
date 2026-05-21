import { EasyedaApi } from './easyeda/easyedaApi.js';
import { Easyeda3dModelImporter, EasyedaFootprintImporter, EasyedaSymbolImporter } from './easyeda/easyedaImporter.js';
import { ExporterSymbolKicad } from './kicad/exportKicadSymbol.js';
import { ExporterFootprintKicad } from './kicad/exportKicadFootprint.js';
import { Exporter3dModelKicad } from './kicad/exportKicad3dmodel.js';
import { KicadVersion } from './kicad/parametersKicadSymbol.js';
import LcscComponent from './LcscComponent.js';

async function convertEasyedaToKicad(componentId, options = {}) {
    const {
