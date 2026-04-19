import { useEffect } from 'react';

interface Options {
    isOpen: boolean;
    onClose: () => void;
    lockScroll?: boolean;
}

/**
 * Closes a modal on Escape and optionally locks body scroll while open.
 * Backdrop click is handled by the consumer via onClick on the overlay element,
 * since backdrop detection depends on the modal's own DOM layout.
 */
export function useModalDismiss({ isOpen, onClose, lockScroll = true }: Options) {
    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKey);
        const prevOverflow = lockScroll ? document.body.style.overflow : null;
        if (lockScroll) document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', handleKey);
            if (lockScroll && prevOverflow !== null) document.body.style.overflow = prevOverflow;
        };
    }, [isOpen, onClose, lockScroll]);
}
