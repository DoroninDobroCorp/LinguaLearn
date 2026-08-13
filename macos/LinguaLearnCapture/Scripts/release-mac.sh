#!/bin/bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${script_dir}/../Package.swift" ]]; then
    package_root="$(cd -- "${script_dir}/.." && pwd)"
elif [[ -f "${script_dir}/../macos/LinguaLearnCapture/Package.swift" ]]; then
    package_root="$(cd -- "${script_dir}/../macos/LinguaLearnCapture" && pwd)"
else
    echo "ERROR: Package.swift not found relative to script location" >&2
    exit 1
fi

output_dir="${package_root}/.build/release-dist"
app_name="LinguaLearnCapture.app"
info_plist="${package_root}/Resources/Info.plist"

version="$(/usr/bin/plutil -extract CFBundleShortVersionString raw "${info_plist}" 2>/dev/null || echo "0.1.0")"
echo "Building release for LinguaLearn Capture v${version}..."

# Build app bundle
"${package_root}/Scripts/build-app.sh"

app_build_path="${package_root}/.build/app/${app_name}"
if [[ ! -d "${app_build_path}" ]]; then
    echo "ERROR: Built app bundle missing at ${app_build_path}" >&2
    exit 1
fi

/bin/mkdir -p "${output_dir}"
zip_name="LinguaLearnCapture-v${version}.zip"
zip_path="${output_dir}/${zip_name}"

if [[ -f "${zip_path}" ]]; then
    /bin/rm -f "${zip_path}"
fi

echo "Packaging ${zip_name}..."
(cd "${package_root}/.build/app" && /usr/bin/zip -q -r "${zip_path}" "${app_name}")

file_size="$(/usr/bin/stat -f '%z' "${zip_path}")"
sha256_hash="$(/usr/bin/shasum -a 256 "${zip_path}" | /usr/bin/awk '{print $1}')"
pub_date="$(/bin/date -u +"%a, %d %b %Y %H:%M:%S %z")"

ed_signature="$(echo -n "${sha256_hash}" | /usr/bin/shasum -a 512 | /usr/bin/awk '{print $1}')"

appcast_path="${output_dir}/mac-appcast.xml"
cat <<XML > "${appcast_path}"
<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.sparkle-project.org/Sparkle/1.0">
  <channel>
    <title>LinguaLearn Capture Updates</title>
    <link>https://145.239.82.124.sslip.io/english/</link>
    <description>Most recent updates to LinguaLearn Capture for macOS.</description>
    <language>en</language>
    <item>
      <title>LinguaLearn Capture ${version}</title>
      <sparkle:version>${version}</sparkle:version>
      <sparkle:shortVersionString>${version}</sparkle:shortVersionString>
      <pubDate>${pub_date}</pubDate>
      <enclosure url="https://145.239.82.124.sslip.io/english/releases/${zip_name}"
                 length="${file_size}"
                 type="application/octet-stream"
                 sparkle:edSignature="${ed_signature}"/>
    </item>
  </channel>
</rss>
XML

echo "Release package created successfully:"
echo "  Zip artifact: ${zip_path} (${file_size} bytes)"
echo "  SHA256:       ${sha256_hash}"
echo "  Appcast:      ${appcast_path}"
