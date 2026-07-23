import ipaddr from "ipaddr.js";

type Address = ipaddr.IPv4 | ipaddr.IPv6;

function parseAddress(value: string): Address | null {
	const cleaned =
		value
			.trim()
			.replace(/^\[|\]$/g, "")
			.split("%")[0] ?? "";
	if (!ipaddr.isValid(cleaned)) return null;
	const address = ipaddr.parse(cleaned);
	if (
		address.kind() === "ipv6" &&
		(address as ipaddr.IPv6).isIPv4MappedAddress()
	) {
		return (address as ipaddr.IPv6).toIPv4Address();
	}
	return address;
}

function isInCidrs(address: Address, cidrs: string[]) {
	return cidrs.some((cidr) => {
		try {
			const [network, prefix] = ipaddr.parseCIDR(cidr);
			if (network.kind() !== address.kind()) return false;
			return address.match(network as never, prefix);
		} catch {
			return false;
		}
	});
}

export function normalizeIp(value: string) {
	const address = parseAddress(value);
	return address?.toNormalizedString() ?? "0.0.0.0";
}

export function clientIp(
	remoteAddress: string | undefined,
	forwardedFor: string | undefined,
	trustedProxyCidrs: string[],
) {
	const remote = parseAddress(remoteAddress ?? "");
	if (!remote) return "0.0.0.0";
	if (!isInCidrs(remote, trustedProxyCidrs) || !forwardedFor) {
		return remote.toNormalizedString();
	}
	const forwarded = forwardedFor.split(",").map((value) => parseAddress(value));
	for (let index = forwarded.length - 1; index >= 0; index -= 1) {
		const candidate = forwarded[index];
		if (!candidate) return "0.0.0.0";
		if (!isInCidrs(candidate, trustedProxyCidrs)) {
			return candidate.toNormalizedString();
		}
	}
	return remote.toNormalizedString();
}

export function isPublicAddress(address: Address) {
	const range = address.range();
	return range === "unicast";
}

export function assertPublicIp(value: string) {
	const address = parseAddress(value);
	if (!address || !isPublicAddress(address)) {
		throw new Error("Remote URL resolves to a private or reserved address");
	}
	return address.toNormalizedString();
}
