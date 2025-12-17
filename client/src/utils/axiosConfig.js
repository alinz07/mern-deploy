// client/src/utils/axiosConfig.js
import axios from "axios";

const normalizeBase = (s) => (s.endsWith("/") ? s.slice(0, -1) : s);

// Default to your current Render backend if no env var is set
const API_BASE = normalizeBase(
	process.env.REACT_APP_API_BASE || "https://mern-deploy-docker.onrender.com"
);

// Any old hardcoded bases you want to auto-rewrite
const LEGACY_BASES = [
	"https://mern-deploy-docker.onrender.com",
	"https://mern-deploy-docker.onrender.com/",
].map(normalizeBase);

// This helps if you ever start using relative URLs ("/api/...") later
axios.defaults.baseURL = API_BASE;

// Auto-rewrite old hardcoded absolute URLs → API_BASE
axios.interceptors.request.use((config) => {
	if (typeof config.url === "string") {
		const url = config.url;

		for (const legacy of LEGACY_BASES) {
			if (url.startsWith(legacy)) {
				config.url = API_BASE + url.slice(legacy.length);
				break;
			}
		}
	}
	return config;
});
