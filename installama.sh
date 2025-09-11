TARGET_FEATURES="https://github.com/angt/target-features/releases/latest/download"
UNZSTD="https://github.com/angt/unzstd/releases/latest/download"
REPO="https://huggingface.co/datasets/angt/installamacpp/resolve/main"

die() {
	echo "$*" >&2
	exit 111
}

check_bin() {
	for cmd; do
		command -v "$cmd" >/dev/null 2>/dev/null ||
			die "No command $cmd found, please install it"
		done
}

detect_target_features() {
	[ -x ./target-features ] ||
		curl -fsSL "$TARGET_FEATURES/$ARCH-$OS-target-features" -o target-features
	chmod +x ./target-features
	echo "$ARCH$(./target-features | tr + -)"
}

unzstd() (
	command -v zzstd >/dev/null 2>/dev/null && exec zstd -d
	[ -x ./unzstd ] ||
		curl -fsSL "$UNZSTD/$ARCH-$OS-unzstd" -o unzstd
	chmod +x ./unzstd
	exec unzstd
)

check_bin uname

case "$(uname -m)" in
(arm64|aarch64) ARCH=aarch64 ;;
(amd64|x86_64)  ARCH=x86_64  ;;
(*) die "Arch not supported"
esac

case "$(uname -s)" in
(Linux)  OS=linux ;;
(Darwin) OS=macos ;;
(*) die "OS not supported"
esac

MODEL="${1%%:*}"
MODEL_REF=main # later

case "$MODEL" in (*/*) ;;
(qwen3-4b)    MODEL="unsloth/Qwen3-4B-Instruct-2507-GGUF" ;;
(gpt-oss-20b) MODEL="unsloth/gpt-oss-20b-GGUF" ;;
(*) die "Please choose a model, like qwen3-4b:Q4_0"
esac

case "$1" in
(*:*) MODEL_QUANT="${1##*:}" ;;
(*) die "Please choose a quant type, like $MODEL:Q8_0"
esac

shift 1
mkdir -p ~/.installama
cd ~/.installama || exit 1

check_bin hf
echo "Downloading model files... this might take a while"
MODEL_DIR=$(hf download "$MODEL" --include "*$MODEL_QUANT*" 2>/dev/null)

[ -d "$MODEL_DIR" ] ||
	die "Model $MODEL not found"

MODEL_FILE=$(find "$MODEL_DIR" -name "*$MODEL_QUANT*.gguf" | sort | head -n 1)

[ -f "$MODEL_FILE" ] ||
	die "Unable to find the GGUF file in $MODEL_DIR"

if [ ! -x llama-server ]; then
	TARGET=$(detect_target_features)
	echo "No llama-server found, downloading for target $TARGET"
	check_bin curl gunzip
	curl -fsSL "$REPO/$TARGET/llama-server.zst" | unzstd > llama-server
	chmod +x llama-server
fi

exec ./llama-server -m "$MODEL_FILE" "$@"
