import { navigationURL } from "../../security/urls.mjs";
export function getLicenceLogo(licenceURL) {
    try {
      const url = new URL(navigationURL(licenceURL));
      if (!["creativecommons.org", "www.creativecommons.org"].includes(url.hostname)) return "";
      if (url.pathname.startsWith("/publicdomain/zero/")) return "https://mirrors.creativecommons.org/presskit/buttons/88x31/svg/cc-zero.svg";
      const code = url.pathname.match(/^\/licenses\/(by(?:-nc)?(?:-sa|-nd)?)\//)?.[1];
      return code ? `https://mirrors.creativecommons.org/presskit/buttons/88x31/svg/${code}.svg` : "";
    } catch { return ""; }
}
