import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	compiler: {
		removeConsole: process.env.NODE_ENV === "production",
	},
	reactStrictMode: true,
	output: "export",
	images: {
		unoptimized: true,
	},
	trailingSlash: true,
};

export default nextConfig;
