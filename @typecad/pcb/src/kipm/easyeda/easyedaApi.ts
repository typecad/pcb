import logger from '../../utils/logging.js';
const API_ENDPOINT = 'https://easyeda.com/api/products/{lcsc_id}/components?version=6.4.19.5';
const ENDPOINT_3D_MODEL = 'https://modules.easyeda.com/3dmodel/{uuid}';
const ENDPOINT_3D_MODEL_STEP = 'https://modules.easyeda.com/qAxj6KHrDKw4blvCG8QJPs7Y/{uuid}';

export class EasyedaApi {
  headers: Record<string, string>;
  constructor() {
    this.headers = {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
  }

  async getInfoFromEasyedaApi(lcsc_id: string) {
    const url = API_ENDPOINT.replace('{lcsc_id}', lcsc_id);
    try {
      const response = await fetch(url, { headers: this.headers });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const text = await response.text();
      let apiResponse: Record<string, unknown>;
      try {
        apiResponse = JSON.parse(text);
      } catch (e) {
        throw new Error(
          `Failed to parse JSON response from EasyEDA. The response might be an HTML error page or Cloudflare challenge.`,
        );
      }
      if (!apiResponse || ('code' in apiResponse && apiResponse.success === false)) {
        logger.debug(apiResponse);
        return {};
      }
      return apiResponse;
    } catch (error) {
      logger.error(`Failed to fetch info from EasyEDA API for ${lcsc_id}:`, (error as Error).message);
      throw error;
    }
  }

  async getCadDataOfComponent(lcsc_id: string) {
    const cpCadInfo = (await this.getInfoFromEasyedaApi(lcsc_id)) as Record<string, any>;
    if (Object.keys(cpCadInfo).length === 0) {
      return {};
    }

    if (!cpCadInfo['result'] || Object.keys(cpCadInfo['result']).length === 0) {
      throw new Error(`Failed to fetch data from EasyEDA API for part ${lcsc_id}`);
    }

    return cpCadInfo['result'];
  }

  async getRaw3dModelObj(uuid: string) {
    const url = ENDPOINT_3D_MODEL.replace('{uuid}', uuid);
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': this.headers['User-Agent'] },
      });
      if (!response.ok) {
        logger.error(`No raw 3D model data found for uuid:${uuid} on easyeda`);
        return null;
      }
      return await response.text();
    } catch (error) {
      logger.error(`Failed to fetch raw 3D model for uuid:${uuid}:`, (error as Error).message);
      return null;
    }
  }

  async getStep3dModel(uuid: string) {
    const url = ENDPOINT_3D_MODEL_STEP.replace('{uuid}', uuid);
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': this.headers['User-Agent'] },
      });
      if (!response.ok) {
        logger.error(`No step 3D model data found for uuid:${uuid} on easyeda`);
        return null;
      }
      return await response.arrayBuffer();
    } catch (error) {
      logger.error(`Failed to fetch step 3D model for uuid:${uuid}:`, (error as Error).message);
      return null;
    }
  }
}
