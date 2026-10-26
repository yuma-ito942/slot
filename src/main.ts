import { mountGame } from "./app/boot";
import { getAudit } from "./core/library";
import { createDemoClient, loadLocalReplay } from "./rgs/demo";
import { createRemoteClient, fetchRemoteReplay } from "./rgs/remote";
import { WalletRejected } from "./rgs/types";

const root = document.querySelector("#app");
if (root instanceof HTMLElement) {
  mountGame(root, {
    async createClient(params) {
      if (params.sessionID) {
        if (!params.rgsUrl) throw new WalletRejected("Missing rgs_url");
        return createRemoteClient(params);
      }
      return createDemoClient(params);
    },
    async loadReplay(params) {
      if (params.rgsUrl) return fetchRemoteReplay(params);
      return loadLocalReplay(params);
    },
    async loadAudit() {
      return getAudit();
    },
  });
}
