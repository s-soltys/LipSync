package util 
{
	import flash.display.MovieClip;
	import flash.events.Event;
	import flash.events.MouseEvent;
	import flash.text.TextField;
	import flash.text.TextFormat;
	/**
	 * ...
	 * @author S
	 */
	public class Label extends MovieClip {
		
		public function Label(text:String) {
			var lbl:TextField = new TextField();
			lbl.selectable = false;
			this.addChild(lbl);
			
			var tf:TextFormat = new TextFormat("Lucida Console", 20, 0x555555, true);
			lbl.text = text;
			lbl.setTextFormat(tf);
			
			lbl.width = 1.2 * lbl.textWidth;
		}
		
		public function onMouseClick(onMouseClick:Function):void {
			this.addEventListener(MouseEvent.CLICK, onMouseClick, false, 0, false);
		}
		
		
	}

}