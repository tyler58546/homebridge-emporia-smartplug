import {
    API,
    APIEvent,
    DynamicPlatformPlugin,
    HAP,
    Logging,
    PlatformAccessory,
    PlatformAccessoryEvent,
    PlatformConfig,
} from "homebridge";
import {EmporiaApi, EmporiaDevice} from "./emporia-api";

const PLUGIN_NAME = "homebridge-emporia-smartplug";
const PLATFORM_NAME = "EmporiaPlatform";

let hap: HAP;
let Accessory: typeof PlatformAccessory;

export = (api: API) => {
    hap = api.hap;
    Accessory = api.platformAccessory;

    api.registerPlatform(PLATFORM_NAME, EmporiaPlatform);
};

interface EmporiaPlatformConfig extends PlatformConfig {
    auth: {username: string, password: string}
}

class EmporiaPlatform implements DynamicPlatformPlugin {

    private readonly log: Logging;
    private readonly api: API;

    private readonly accessories: PlatformAccessory[] = [];

    private readonly emporiaApi: EmporiaApi;

    constructor(log: Logging, config: PlatformConfig, api: API) {
        this.log = log;
        this.api = api;
        const auth = (config as EmporiaPlatformConfig).auth;
        this.emporiaApi = new EmporiaApi(auth);
        api.on(APIEvent.DID_FINISH_LAUNCHING, async () => {
            try {
                await this.emporiaApi.login();
            } catch (err) {
                this.log.error("Failed to login.");
                // @ts-ignore
                this.log.error(err);
                return;
            }
            setInterval(this.discoverDevices.bind(this), 5 * 1000);
        });
    }

    /*
     * This function is invoked when homebridge restores cached accessories from disk at startup.
     * It should be used to setup event handlers for characteristics and update respective values.
     */
    configureAccessory(accessory: PlatformAccessory): void {
        this.log("Configuring accessory %s", accessory.displayName);

        accessory.on(PlatformAccessoryEvent.IDENTIFY, () => {
            this.log("%s identified!", accessory.displayName);
        });

        const device: () => EmporiaDevice = () => accessory.context.device

        accessory.getService(hap.Service.Outlet)!.getCharacteristic(hap.Characteristic.On)
            .onSet(async (value) => {
                try {
                    device().outlet = await this.emporiaApi.setOutletOn(device().deviceGid, value as boolean);
                } catch (e) {
                    this.log.error(`Failed to update outlet: ${e}`);
                }

            })
            .onGet(async () => {
                return device().outlet.outletOn;
            });

        accessory.getService(hap.Service.AccessoryInformation)!.getCharacteristic(hap.Characteristic.Identify)
            .onSet(async (_) => {});

        accessory.getService(hap.Service.AccessoryInformation)!.getCharacteristic(hap.Characteristic.Manufacturer)
            .onGet(async () => "Emporia");

        accessory.getService(hap.Service.AccessoryInformation)!.getCharacteristic(hap.Characteristic.Model)
            .onGet(async () => device().model);

        accessory.getService(hap.Service.AccessoryInformation)!.getCharacteristic(hap.Characteristic.Name)
            .onGet(async () => device().locationProperties.deviceName);

        accessory.getService(hap.Service.AccessoryInformation)!.getCharacteristic(hap.Characteristic.SerialNumber)
            .onGet(async () => device().deviceGid.toString());

        accessory.getService(hap.Service.AccessoryInformation)!.getCharacteristic(hap.Characteristic.FirmwareRevision)
            .onGet(async () => device().firmware);

        this.accessories.push(accessory);
    }

    private async discoverDevices() {
        if (!this.emporiaApi) {
            return;
        }
        try {
            const devices = await this.emporiaApi.getDevices();
            for (const device of devices as EmporiaDevice[]) {
                if (!device.outlet) {
                    continue;
                }
                const uuid = this.api.hap.uuid.generate(device.deviceGid.toString());
                const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
                if (existingAccessory) {
                    existingAccessory.context.device = device;
                } else {
                    this.log.info("Registering new device: " + device.locationProperties.deviceName);
                    const deviceName = device.locationProperties.deviceName;
                    const accessory = new this.api.platformAccessory(deviceName, uuid);
                    accessory.context.device = device;
                    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                    accessory.addService(hap.Service.Outlet);
                    this.configureAccessory(accessory);
                }
            }
        } catch (e) {
            // @ts-ignore
            this.log.error(e);
        }
    }
}
