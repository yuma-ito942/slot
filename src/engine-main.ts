import { mountGame } from "./app/boot";
import { createRemoteClient, fetchRemoteReplay } from "./rgs/remote";
import { WalletRejected } from "./rgs/types";

const root = document.querySelector("#app");
if (root instanceof HTMLElement) {
  mountGame(root, {
    async createClient(params) {
      if (!params.sessionID || !params.rgsUrl) {
        throw new WalletRejected("This build has no local wallet. Launch with sessionID and rgs_url.");
      }
      return createRemoteClient(params);
    },
    async loadReplay(params) {
      if (!params.rgsUrl || !params.game || !params.version || !params.mode || !params.event) {
        throw new Error("Replay data is unavailable");
      }
      return fetchRemoteReplay(params);
    },
    async loadAudit() {
      return null;
    },
  });
}
