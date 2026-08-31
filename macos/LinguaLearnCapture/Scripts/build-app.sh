#!/bin/bash
set -euo pipefail

package_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
output_root="${LINGUALEARN_BUILD_OUTPUT:-${package_root}/.build/app}"
app_name="LinguaLearnCapture.app"
app_output="${output_root}/${app_name}"

cd "${package_root}"
/usr/bin/swift build -c release --arch arm64
binary_dir="$(/usr/bin/swift build -c release --arch arm64 --show-bin-path)"

temporary_root="$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/lingualearn-capture-build.XXXXXX")"
trap '/bin/rm -rf -- "${temporary_root}"' EXIT
temporary_app="${temporary_root}/${app_name}"

/bin/mkdir -p "${temporary_app}/Contents/MacOS" "${temporary_app}/Contents/Resources" "${temporary_app}/Contents/Frameworks"
/usr/bin/ditto "${binary_dir}/LinguaLearnCapture" "${temporary_app}/Contents/MacOS/LinguaLearnCapture"
if [[ -d "${binary_dir}/Sparkle.framework" ]]; then
    /usr/bin/ditto "${binary_dir}/Sparkle.framework" "${temporary_app}/Contents/Frameworks/Sparkle.framework"
fi
/usr/bin/install_name_tool -add_rpath "@executable_path/../Frameworks" "${temporary_app}/Contents/MacOS/LinguaLearnCapture" 2>/dev/null || true
/usr/bin/install_name_tool -add_rpath "@loader_path/../Frameworks" "${temporary_app}/Contents/MacOS/LinguaLearnCapture" 2>/dev/null || true
/bin/cp "${package_root}/Resources/Info.plist" "${temporary_app}/Contents/Info.plist"
/bin/chmod 0755 "${temporary_app}/Contents/MacOS/LinguaLearnCapture"

codesign_identity="${LINGUALEARN_CODESIGN_IDENTITY:-}"
if [[ -z "${codesign_identity}" ]]; then
    # A stable development signature preserves the app's Accessibility identity
    # across rebuilds. Fall back to ad-hoc when the machine has no certificate.
    codesign_identity="$(/usr/bin/security find-identity -v -p codesigning 2>/dev/null \
        | /usr/bin/awk '/Apple Development:/ { print $2; exit }')"
fi
if [[ -n "${codesign_identity}" ]]; then
    /usr/bin/codesign --force --sign "${codesign_identity}" --timestamp=none "${temporary_app}"
    echo "Signed with stable Apple Development identity ${codesign_identity}"
else
    /usr/bin/codesign --force --sign - --timestamp=none "${temporary_app}"
    echo "Signed ad-hoc (set LINGUALEARN_CODESIGN_IDENTITY to preserve Accessibility trust across rebuilds)"
fi

/bin/mkdir -p "${output_root}"
if [[ -e "${app_output}" ]]; then
    /bin/rm -rf -- "${app_output}"
fi
/usr/bin/ditto "${temporary_app}" "${app_output}"

/usr/bin/lipo -info "${app_output}/Contents/MacOS/LinguaLearnCapture"
/usr/bin/codesign --verify --deep --strict "${app_output}"
echo "Built ${app_output}"
