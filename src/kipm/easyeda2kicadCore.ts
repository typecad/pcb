import { EasyedaApi } from './easyeda/easyedaApi.js';
import { Easyeda3dModelImporter, EasyedaFootprintImporter, EasyedaSymbolImporter } from './easyeda/easyedaImporter.js';
import { ExporterSymbolKicad } from './kicad/exportKicadSymbol.js';
import { ExporterFootprintKicad } from './kicad/exportKicadFootprint.js';
import { Exporter3dModelKicad } from './kicad/exportKicad3dmodel.js';
import { KicadVersion } from './kicad/parametersKicadSymbol.js';
import LcscComponent from './LcscComponent.js';

async function convertEasyedaToKicad(componentId: string, options: Record<string, any> = {}) {
  const { kicadVersion = KicadVersion.v6, footprintLibName = 'easyeda2kicad' } = options;

  const lcscComponent = new LcscComponent(componentId, kicadVersion, footprintLibName);

  const api = new EasyedaApi();
  lcscComponent.setCadData(await api.getCadDataOfComponent(componentId));

  const uuid = lcscComponent.get3DModelInfo().uuid;
  const rawObj = await api.getRaw3dModelObj(uuid);
  const step = await api.getStep3dModel(uuid);
  lcscComponent.set3dRawObj(rawObj);
  lcscComponent.set3dStep(step);

  const result = {
    symbol: lcscComponent.createSymbolResult(),
    footprint: await lcscComponent.createFootprintResult(),
    model3d: await lcscComponent.create3dModelResult(),
  };

  return result;
}

export { convertEasyedaToKicad };
