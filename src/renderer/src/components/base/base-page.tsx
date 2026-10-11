import { Button } from '@renderer/components/ui/button'
import { platform } from '@renderer/utils/init'
import WindowControls from '@renderer/components/window-controls'
import React, { forwardRef, useImperativeHandle, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

const sidebarPaths = new Set(['/home', '/telegram', '/zapret', '/services', '/network', '/logs', '/settings', '/about'])
const isMac = platform === 'darwin'

interface Props {
  title?: React.ReactNode
  header?: React.ReactNode
  children?: React.ReactNode
  contentClassName?: string
  showBackButton?: boolean
}

const BasePage = forwardRef<HTMLDivElement, Props>((props, ref) => {
  const location = useLocation()
  const navigate = useNavigate()
  const isSubPage = !sidebarPaths.has(location.pathname)

  const contentRef = useRef<HTMLDivElement>(null)
  useImperativeHandle(ref, () => {
    return contentRef.current as HTMLDivElement
  })

  return (
    <div ref={contentRef} className="w-full h-full flex flex-col">
      <div className="sticky top-0 z-40 w-full shrink-0 bg-background/80 backdrop-blur-md border-b border-border/30">
        <div className="app-drag px-2 pt-2.5 pb-2 flex justify-between h-13.5">
          <div className="title h-full text-lg leading-8 flex items-center gap-1">
            {(isSubPage || props.showBackButton) && (
              <Button
                size="icon-sm"
                variant="ghost"
                className="app-nodrag"
                onClick={() => navigate(-1)}
              >
                <ChevronLeft className="size-5" />
              </Button>
            )}
            {props.title}
          </div>
          <div className="header flex gap-1 h-full items-center app-nodrag">
            {props.header}
            {!isMac && <WindowControls />}
          </div>
        </div>
      </div>
      <div className="content flex-1 overflow-y-auto custom-scrollbar">
        {props.children}
      </div>
    </div>
  )
})

BasePage.displayName = 'BasePage'
export default BasePage
