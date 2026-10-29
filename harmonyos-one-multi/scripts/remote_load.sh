#!/bin/bash

# ================================================================
# harmonyos-one-multi 技能集安装脚本
# 整仓布局：入口 SKILL.md 与 6 个领域 skill 同在一个目录（本仓）。
# 优先从本仓目录本地安装；本仓不含对应 skill 源时回退云端拉取
# （zip 直链或 Matrix 注册表），缓存后安装。
# ================================================================

set -e

# ---------- 技能集清单 ----------
ALLOWED_SKILLS="harmonyos-one-multi harmonyos-ui-multi harmonyos-workflow-multi harmonyos-camera-multi harmonyos-h5-multi harmonyos-rn-multi harmonyos-flutter-multi"

# `all` 时安装全部领域 Skill（不含入口自身）
DOMAIN_SKILLS="harmonyos-ui-multi harmonyos-workflow-multi harmonyos-camera-multi harmonyos-h5-multi harmonyos-rn-multi harmonyos-flutter-multi"

# 单独安装时的依赖映射
get_deps() { echo ""; }

# ---------- 云端回退地址（本地无源时才使用） ----------
MATRIX_BASE="https://matrix.openharmony.cn/api/registry/skill"
DEFAULT_BASE_URL="${ONE_MULTI_SKILL_BASE_URL:-$MATRIX_BASE}"
DEFAULT_URL_STYLE="${ONE_MULTI_SKILL_URL_STYLE:-registry}"

DEFAULT_CACHE_ROOT="${HOME}/.cache/ai-skill-cache"
GROUP_DIR="harmonyos-one-multi"

# ---------- 平台目录映射 ----------
get_platform_dir() {
    case "$1" in
        claude)    echo ".claude/skills" ;;
        zcode)     echo ".zcode/skills" ;;
        agents)    echo ".agents/skills" ;;
        codex)     echo ".codex/skills" ;;
        opencode)  echo ".opencode/skills" ;;
        gemini)    echo ".gemini/skills" ;;
        openclaw)  echo ".openclaw/skills" ;;
        *)         echo "" ;;
    esac
}

is_valid_platform() {
    case "$1" in
        claude|zcode|agents|codex|opencode|gemini|openclaw|custom) return 0 ;;
        *) return 1 ;;
    esac
}

is_allowed_skill() {
    case "$1" in
        ""|*[!A-Za-z0-9._-]*) return 1 ;;
    esac
    for s in $ALLOWED_SKILLS; do
        [ "$s" = "$1" ] && return 0
    done
    return 1
}

show_usage() {
    cat <<'EOF'
Usage: remote_load.sh <skill-name|all> [platforms...] [options]

安装 harmonyos-one-multi 技能集的 Skill。本仓为整仓布局（入口
SKILL.md 与 6 个领域 skill 同目录），默认优先从本仓本地安装；
本仓没有对应源时回退云端拉取并缓存。`all` 安装全部领域 Skill。

Platforms (可选，可多个；缺省为 auto):
  auto       自动检测：安装到本仓所在的 skills 根目录，
             检测不到时安装到 ~/.agents/skills
  claude     Claude Code    (~/.claude/skills)
  zcode      ZCode          (~/.zcode/skills)
  agents     通用标准       (~/.agents/skills)
  codex      Codex CLI      (~/.codex/skills)
  opencode   OpenCode       (~/.opencode/skills)
  gemini     Gemini CLI     (~/.gemini/skills)
  openclaw   OpenClaw       (~/.openclaw/skills)
  custom     自定义路径（需配合 -d）

Options:
  -d <path>              自定义安装路径（配合 custom 平台）
  --no-local             跳过本地源，强制走云端拉取
  --base-url <url>       云端地址（仅回退时使用）
  --url-style <style>    zip:      <base-url>/<skill-name>.zip
                         registry: <base-url>/<skill-name>/install?format=zip
                         默认 registry（Matrix 技能注册表）
  --with-deps            连同依赖一起安装（all 已天然包含全部依赖）
  --cache-root <dir>     本地缓存根目录（默认 ~/.cache/ai-skill-cache）
  --link-mode <mode>     symlink（默认）或 copy
  --force-refresh        忽略缓存强制重新下载（仅云端源；本地源始终现装）
  --no-cache             跳过缓存直接下载
  --dry-run              只打印安装来源与 URL，不执行
  --list                 列出技能集清单与依赖关系
  -h, --help             帮助

Environment:
  ONE_MULTI_SKILL_BASE_URL    覆盖默认云端地址
  ONE_MULTI_SKILL_URL_STYLE   覆盖默认 URL 形态（zip / registry）

Allowed skills:
EOF
    echo "  all -> ${DOMAIN_SKILLS}"
    for s in $ALLOWED_SKILLS; do
        dep=$(get_deps "$s")
        if [ -n "$dep" ]; then
            echo "  $s  (deps: $(echo $dep | tr ' ' ','))"
        else
            echo "  $s"
        fi
    done
}

# ---------- 参数解析 ----------
SKILL_NAME=""
CUSTOM_DIR=""
BASE_URL="$DEFAULT_BASE_URL"
URL_STYLE="$DEFAULT_URL_STYLE"
CACHE_ROOT="$DEFAULT_CACHE_ROOT"
LINK_MODE="symlink"
FORCE_REFRESH="false"
NO_CACHE="false"
NO_LOCAL="false"
DRY_RUN="false"
WITH_DEPS="false"
SELECTED_PLATFORMS=""

while [ $# -gt 0 ]; do
    case "$1" in
        -h|--help) show_usage; exit 0 ;;
        --list)
            echo "all -> ${DOMAIN_SKILLS}"
            for s in $ALLOWED_SKILLS; do
                dep=$(get_deps "$s")
                if [ -n "$dep" ]; then echo "$s -> $dep"; else echo "$s"; fi
            done
            exit 0 ;;
        -d)
            [ -z "${2:-}" ] && { echo "Error: -d requires a path" >&2; exit 1; }
            CUSTOM_DIR="$2"; shift 2 ;;
        --base-url)
            [ -z "${2:-}" ] && { echo "Error: --base-url requires a URL" >&2; exit 1; }
            BASE_URL="$2"; shift 2 ;;
        --url-style)
            [ -z "${2:-}" ] && { echo "Error: --url-style requires zip|registry" >&2; exit 1; }
            URL_STYLE="$2"; shift 2 ;;
        --cache-root)
            [ -z "${2:-}" ] && { echo "Error: --cache-root requires a dir" >&2; exit 1; }
            CACHE_ROOT="$2"; shift 2 ;;
        --link-mode)
            [ -z "${2:-}" ] && { echo "Error: --link-mode requires symlink|copy" >&2; exit 1; }
            LINK_MODE="$2"; shift 2 ;;
        --force-refresh) FORCE_REFRESH="true"; shift ;;
        --no-cache)       NO_CACHE="true"; shift ;;
        --no-local)       NO_LOCAL="true"; shift ;;
        --dry-run)        DRY_RUN="true"; shift ;;
        --with-deps)      WITH_DEPS="true"; shift ;;
        *)
            if [ -z "$SKILL_NAME" ]; then
                SKILL_NAME="$1"
            elif is_valid_platform "$1"; then
                case " $SELECTED_PLATFORMS " in
                    *" $1 "*) ;;
                    *) SELECTED_PLATFORMS="${SELECTED_PLATFORMS:+$SELECTED_PLATFORMS }$1" ;;
                esac
            else
                echo "Error: unknown argument or platform '$1'" >&2
                show_usage >&2; exit 1
            fi
            shift ;;
    esac
done

if [ -z "$SKILL_NAME" ]; then
    show_usage >&2
    exit 1
fi

if [ "$SKILL_NAME" = "all" ]; then
    SKILLS_TO_INSTALL="$DOMAIN_SKILLS"
elif ! is_allowed_skill "$SKILL_NAME"; then
    echo "Error: skill '$SKILL_NAME' is not in the harmonyos-one-multi whitelist." >&2
    echo "Run with --list to see allowed skills (or use 'all' to install the whole set)." >&2
    exit 1
else
    SKILLS_TO_INSTALL="$SKILL_NAME"
    if [ "$WITH_DEPS" = "true" ]; then
        for dep in $(get_deps "$SKILL_NAME"); do
            case " $SKILLS_TO_INSTALL " in
                *" $dep "*) ;;
                *) SKILLS_TO_INSTALL="$SKILLS_TO_INSTALL $dep" ;;
            esac
        done
    fi
fi

if [ "$URL_STYLE" != "zip" ] && [ "$URL_STYLE" != "registry" ]; then
    echo "Error: --url-style must be 'zip' or 'registry'" >&2
    exit 1
fi
if [ "$LINK_MODE" != "symlink" ] && [ "$LINK_MODE" != "copy" ]; then
    echo "Error: --link-mode must be 'symlink' or 'copy'" >&2
    exit 1
fi

# ---------- 本仓位置与默认安装根目录 ----------
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=""
if [ -f "$SCRIPT_DIR/../SKILL.md" ]; then
    REPO_ROOT=$(cd "$SCRIPT_DIR/.." 2>/dev/null && pwd) || REPO_ROOT=""
fi
[ -n "$REPO_ROOT" ] && [ -d "$REPO_ROOT" ] || REPO_ROOT=""

AUTO_ROOT=""
if [ -n "$REPO_ROOT" ]; then
    AUTO_ROOT=$(cd "$REPO_ROOT/.." 2>/dev/null && pwd) || AUTO_ROOT=""
fi
DEFAULT_ROOT="${AUTO_ROOT:-$HOME/.agents/skills}"

# 本地源判定：skill 源目录就在本仓内
local_source_of() {
    [ "$NO_LOCAL" = "true" ] && return 1
    [ -n "$REPO_ROOT" ] && [ -f "$REPO_ROOT/$1/SKILL.md" ] && { echo "$REPO_ROOT/$1"; return 0; }
    return 1
}

# ---------- URL 解析 ----------
build_url() {
    case "$URL_STYLE" in
        zip)      echo "${BASE_URL%/}/$1.zip" ;;
        registry) echo "${BASE_URL%/}/$1/install?format=zip" ;;
    esac
}

if [ "$DRY_RUN" = "true" ]; then
    echo "repo-root: ${REPO_ROOT:-<not detected>}"
    for s in $SKILLS_TO_INSTALL; do
        src=$(local_source_of "$s")
        if [ -n "$src" ]; then
            echo "local    $s  <- $src"
        else
            echo "remote   $s  <- $(build_url "$s")"
        fi
    done
    exit 0
fi

if [ -z "$SELECTED_PLATFORMS" ]; then
    echo "No platform specified; installing to auto-detected skills root:"
    echo "  $DEFAULT_ROOT"
    SELECTED_PLATFORMS="__auto__"
fi

# ---------- 云端下载与缓存（回退路径） ----------
fetch_into_cache() {
    local s="$1"
    local cache_dir="${CACHE_ROOT}/${GROUP_DIR}/${s}"
    local manifest="${cache_dir}/.manifest.json"

    if [ "$NO_CACHE" != "true" ] && [ "$FORCE_REFRESH" != "true" ] \
       && [ -f "$manifest" ] && [ -f "${cache_dir}/SKILL.md" ]; then
        echo "Using cached ${s} (${cache_dir})"
        return 0
    fi

    local url tmp_zip tmp_dir
    url=$(build_url "$s")
    tmp_zip=$(mktemp)
    tmp_dir=$(mktemp -d)

    echo "Downloading ${s} from:"
    echo "  $url"
    if ! curl -fsSL --retry 2 --connect-timeout 15 "$url" -o "$tmp_zip"; then
        echo "Error: download failed for ${s}" >&2
        rm -rf "$tmp_zip" "$tmp_dir"
        return 2
    fi
    if ! unzip -qq -t "$tmp_zip" >/dev/null 2>&1; then
        echo "Error: downloaded file for ${s} is not a valid zip" >&2
        rm -rf "$tmp_zip" "$tmp_dir"
        return 2
    fi

    unzip -qq -o "$tmp_zip" -d "$tmp_dir"
    local content_dir="$tmp_dir"
    if [ -f "$tmp_dir/$s/SKILL.md" ]; then
        content_dir="$tmp_dir/$s"
    elif [ -f "$tmp_dir/SKILL.md" ]; then
        content_dir="$tmp_dir"
    else
        echo "Error: zip for ${s} contains no SKILL.md" >&2
        rm -rf "$tmp_zip" "$tmp_dir"
        return 2
    fi

    mkdir -p "${CACHE_ROOT}/${GROUP_DIR}"
    rm -rf "${cache_dir}"
    mv "$content_dir" "$cache_dir"
    rm -rf "$tmp_zip" "$tmp_dir"

    local ts
    ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    cat > "${cache_dir}/.manifest.json" <<EOF
{
  "skillName": "${s}",
  "group": "${GROUP_DIR}",
  "source": "${url}",
  "cachedAt": "${ts}",
  "linkMode": "${LINK_MODE}"
}
EOF
    echo "  OK cached to ${cache_dir}"
    return 0
}

# ---------- 安装（暴露到目标目录） ----------
install_source() {
    local s="$1" src="$2" target="$3" origin="$4"

    # 不覆盖正在运行的入口 skill 目录：rm -rf 自身会导致脚本执行中断
    if [ -n "$REPO_ROOT" ]; then
        local tparent
        tparent=$(cd "$(dirname "$target")" 2>/dev/null && pwd) || tparent="$(dirname "$target")"
        if [ "${tparent}/$(basename "$target")" = "$REPO_ROOT" ]; then
            echo "  SKIP self-install: ${target} 是当前运行的入口 Skill 目录"
            return 0
        fi
    fi

    rm -rf "$target"
    if [ "$LINK_MODE" = "symlink" ]; then
        mkdir -p "$(dirname "$target")"
        ln -s "$src" "$target"
        echo "  OK [${origin}] linked: ${target} -> ${src}"
    else
        mkdir -p "$target"
        cp -R "$src/." "$target/"
        echo "  OK [${origin}] copied to ${target}/"
    fi
}

install_skill() {
    local s="$1" src="$2" origin="$3"
    for platform in $SELECTED_PLATFORMS; do
        if [ "$platform" = "__auto__" ]; then
            install_source "$s" "$src" "${DEFAULT_ROOT}/${s}" "$origin"
        elif [ "$platform" = "custom" ]; then
            if [ -z "$CUSTOM_DIR" ]; then
                echo "Error: 'custom' requires -d <path>" >&2
                return 1
            fi
            install_source "$s" "$src" "$CUSTOM_DIR" "$origin"
        else
            pdir=$(get_platform_dir "$platform")
            install_source "$s" "$src" "${HOME}/${pdir}/${s}" "$origin"
        fi
    done
}

FAILED=0
for s in $SKILLS_TO_INSTALL; do
    echo "== ${s} =="
    src=$(local_source_of "$s")
    if [ -n "$src" ]; then
        echo "Local source found: $src"
        install_skill "$s" "$src" "local" || FAILED=1
    else
        fetch_into_cache "$s" || { FAILED=1; continue; }
        install_skill "$s" "${CACHE_ROOT}/${GROUP_DIR}/${s}" "remote" || FAILED=1
    fi
    echo ""
done

if [ "$FAILED" = "1" ]; then
    echo "========================================"
    echo "Some skills failed to install. Check errors above." >&2
    exit 2
fi

echo "========================================"
echo "All requested skills installed."
echo "Link mode:  ${LINK_MODE}"
echo ""
echo "Note: 新安装的 skill 通常在下一次 turn 或新会话中被 agent 自动发现；"
echo "当前会话内可直接 Read 已安装目录下的 SKILL.md 立即使用其内容。"
echo "========================================"
