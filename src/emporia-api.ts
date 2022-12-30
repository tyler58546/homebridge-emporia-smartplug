import {AuthenticationDetails, CognitoUser, CognitoUserPool} from "amazon-cognito-identity-js";
import axios, {AxiosInstance} from "axios";

export class EmporiaApi {
    private readonly authenticationDetails: AuthenticationDetails;
    private readonly cognitoUser: CognitoUser;
    private apiInstance: AxiosInstance | undefined;
    private tokenExpiration: number | undefined;

    constructor(auth: {username: string, password: string}) {
        this.authenticationDetails = new AuthenticationDetails({
            Username : auth.username,
            Password : auth.password,
        });
        const userPool = new CognitoUserPool({
            UserPoolId : "us-east-2_ghlOXVLi1",
            ClientId : "4qte47jbstod8apnfic0bunmrq",
        });
        this.cognitoUser = new CognitoUser({
            Username : auth.username,
            Pool : userPool,
        });
    }

    login() {
        return new Promise<void>((resolve, reject) => {
            this.cognitoUser.authenticateUser(this.authenticationDetails, {
                onSuccess: (result) => {
                    this.apiInstance = axios.create({
                        baseURL: 'https://api.emporiaenergy.com/',
                        timeout: 1000,
                        headers: {'authtoken': result.getIdToken().getJwtToken()},
                    });
                    this.tokenExpiration = result.getIdToken().getExpiration();
                    resolve();
                },
                onFailure: reject
            });
        })
    }

    private async ensureToken() {
        if (this.apiInstance == null || (Date.now() / 1000) > this.tokenExpiration! - 100) {
            await this.login();
        }
    }

    async getDevices(): Promise<EmporiaDevice[]> {
        await this.ensureToken();
        const resp = await this.apiInstance!.get("customers/devices");
        return resp.data.devices;
    }

    async setOutletOn(deviceGid: number, outletOn: boolean): Promise<EmporiaOutlet> {
        await this.ensureToken();
        const resp = await this.apiInstance!.put("devices/outlet", {
            deviceGid,
            outletOn,
        });
        return resp.data;
    }
}

export type EmporiaDevice = {
    deviceGid: number;
    manufacturerDeviceId: string;
    model: string;
    firmware: string;
    locationProperties: EmporiaLocationProperties;
    outlet: EmporiaOutlet;
}

export type EmporiaOutlet = {
    deviceGid: number;
    outletOn: boolean;
}

export type EmporiaLocationProperties = {
    deviceName: string;
}
