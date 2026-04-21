/**
 * src/components/FileUploadZone.tsx
 * Reusable drag-and-drop + click-to-browse file upload zone.
 * Supports preview (images), file name display, and removal.
 */
import { useRef, useState, useCallback } from "react";
import { Upload, X, FileText, CheckCircle2 } from "lucide-react";

interface FileUploadZoneProps {
    accept?: string;          // e.g. ".pdf,.jpg,.jpeg,.png"
    maxSizeMB?: number;
    hint?: string;            // shown below the icon
    multiple?: boolean;
    onFilesChange?: (files: File[]) => void;
    className?: string;
    accentClass?: string;     // tailwind colour token e.g. "primary" | "marrow"
}

export default function FileUploadZone({
    accept = ".pdf,.jpg,.jpeg,.png",
    maxSizeMB = 5,
    hint,
    multiple = false,
    onFilesChange,
    className = "",
    accentClass = "primary",
}: FileUploadZoneProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [files, setFiles] = useState<File[]>([]);
    const [dragging, setDragging] = useState(false);
    const [error, setError] = useState("");

    const maxBytes = maxSizeMB * 1024 * 1024;

    const addFiles = useCallback((incoming: FileList | null) => {
        if (!incoming) return;
        setError("");
        const valid: File[] = [];
        Array.from(incoming).forEach((f) => {
            if (f.size > maxBytes) {
                setError(`"${f.name}" exceeds ${maxSizeMB} MB limit.`);
            } else {
                valid.push(f);
            }
        });
        const next = multiple ? [...files, ...valid] : valid.slice(0, 1);
        setFiles(next);
        onFilesChange?.(next);
    }, [files, maxBytes, maxSizeMB, multiple, onFilesChange]);

    const remove = (idx: number) => {
        const next = files.filter((_, i) => i !== idx);
        setFiles(next);
        onFilesChange?.(next);
        // reset the hidden input so the same file can be re-selected
        if (inputRef.current) inputRef.current.value = "";
    };

    const isImage = (f: File) => f.type.startsWith("image/");

    return (
        <div className={`space-y-2 ${className}`}>
            {/* Drop zone */}
            <div
                role="button"
                tabIndex={0}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    addFiles(e.dataTransfer.files);
                }}
                className={`