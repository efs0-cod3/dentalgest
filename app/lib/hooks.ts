import { useEffect, useRef } from 'react'
import { useNavigation } from 'react-router'

// react-router clears navigation.formData the same instant navigation.state
// becomes "idle", so a `state === 'idle' && formData` check never fires.
// Track the submitting -> idle transition explicitly instead.
export function useCloseOnSubmit(onClose: () => void) {
  const navigation = useNavigation()
  const wasSubmitting = useRef(false)
  useEffect(() => {
    if (navigation.state === 'submitting') wasSubmitting.current = true
    else if (navigation.state === 'idle' && wasSubmitting.current) {
      wasSubmitting.current = false
      onClose()
    }
  }, [navigation.state])
}
