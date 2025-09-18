TARGET_FEATURES="https://github.com/angt/target-features/releases/latest/download"
UNZSTD="https://github.com/angt/unzstd/releases/latest/download"
REPO="https://huggingface.co/datasets/angt/installamacpp/resolve/main"
REPO_CUDA="https://huggingface.co/datasets/angt/installamacpp-cuda/resolve/main"
REPO_METAL="https://huggingface.co/datasets/angt/installamacpp-metal/resolve/main"

die() {
	for msg; do echo "$msg"; done >&2
	exit 111
}

check_bin() {
	command -v "$1" >/dev/null 2>/dev/null
}

dl_bin() {
	[ -x "$1" ] && return
	check_bin curl || die "Please install curl"
	case "$2" in
	(*.zst) curl -fsSL "$2" | unzstd ;;
	(*)     curl -fsSL "$2" ;;
	esac > "$1"
	chmod +x "$1"
}

unzstd() (
	command -v zstd >/dev/null 2>/dev/null && exec zstd -d
	dl_bin unzstd "$UNZSTD/$ARCH-$OS-unzstd"
	exec ./unzstd
)

llama_server_cuda() {
	dl_bin cuda-probe "$REPO_CUDA/cuda-probe.zst" &&
	CUDA_ARCH=$(./cuda-probe 2>/dev/null) &&
	dl_bin llama-server "$REPO_CUDA/llama-server-cuda-$CUDA_ARCH.zst"
}

llama_server_cpu() {
	dl_bin target-features "$TARGET_FEATURES/$ARCH-$OS-target-features" &&
	TARGET="$ARCH$(./target-features | tr '+' '~')" &&
	dl_bin llama-server "$REPO/$TARGET/llama-server.zst"
}

llama_server_metal() {
	MODEL=$(sysctl -n machdep.cpu.brand_string 2>/dev/null) &&
	case "$MODEL" in ("Apple M"[1234]) ;; (*) false ;; esac &&
	dl_bin llama-server "$REPO_METAL/llama-server-m1.zst"
}

main() {
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
	# MODEL_REF=main

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

	if [ "$OS" = macos ]; then
		[ -x llama-server ] || llama_server_metal
	else
		[ -x llama-server ] || llama_server_cuda
		[ -x llama-server ] || llama_server_cpu
	fi

	[ -x llama-server ] || die \
		"No prebuilt llama-server binary is available for your system." \
		"Please compile llama.cpp from source instead."

	exec ./llama-server -m "$MODEL_FILE" "$@"
}

main "$@"
