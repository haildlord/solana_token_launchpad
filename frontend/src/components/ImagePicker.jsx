import { useEffect, useRef, useState } from "react";

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

// Lets the user choose a picture and shows a preview. onChange gets the File (or null).
export default function ImagePicker({ file, currentUrl, onChange, onError }) {
    const input = useRef(null);
    const [preview, setPreview] = useState("");

    useEffect(() => {
        if (!file) {
            setPreview("");
            return;
        }
        const url = URL.createObjectURL(file);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    function pick(e) {
        const chosen = e.target.files?.[0];
        e.target.value = "";
        if (!chosen) return;
        if (!TYPES.includes(chosen.type)) return onError?.("Image must be a png, jpg, webp or gif.");
        if (chosen.size > MAX_BYTES) return onError?.("Image must be 2MB or smaller.");
        onError?.("");
        onChange(chosen);
    }

    return (
        <div className="image-picker">
            <button type="button" className="image-drop" onClick={() => input.current.click()} aria-label="Choose token image">
                {preview || currentUrl ? <img src={preview || currentUrl} alt="Token" /> : <span>Add image</span>}
            </button>
            <div className="image-picker-text">
                <strong>{currentUrl && !file ? "Current image" : "Token image"}</strong>
                <span className="muted">PNG, JPG, WEBP or GIF, up to 2MB. Square images look best.</span>
                {file && (
                    <button type="button" className="link-button" onClick={() => onChange(null)}>
                        Remove
                    </button>
                )}
            </div>
            <input ref={input} type="file" accept={TYPES.join(",")} onChange={pick} hidden />
        </div>
    );
}
