package avatar3D.face.eyes 
{
	import avatar3D.core.AvatarFeature;
	import away3d.containers.ObjectContainer3D;
	import flash.events.Event;
	import flash.events.TimerEvent;
	import flash.utils.Timer;
	
	/**
	 * ...
	 * @author S
	 */
	public class AvatarEye
	{
		private var blinkTime:Number;
		private var blinkPause:Number;
		
		private var blinkTimer:Timer;
		
		private var eyeball:AvatarFeature;
		private var eyelid:AvatarFeature;
		private var eyebrow_i:AvatarFeature;
		private var eyebrow_o:AvatarFeature;
		private var eyebrow:AvatarFeature;
		
		public function AvatarEye(avatar:ObjectContainer3D, xml:XMLList) {
			eyelid = new AvatarFeature(avatar, xml.eyelid);
			eyeball = new AvatarFeature(avatar, xml.eyeball);
			
			eyebrow_i = new AvatarFeature(avatar, xml.eyebrow_i);
			eyebrow_o = new AvatarFeature(avatar, xml.eyebrow_o);
		}
		
		public function setupMotionParameters(blinkTime:Number, blinkPause:Number):void {
			this.blinkTime = blinkTime;
			this.blinkPause = blinkPause;
		}
		
		public function blink():void {
			eyelid.rotX.setValueTween(1.0, blinkTime, 0.0, "easeInOutSine");
			eyelid.rotX.setValueTween(0.0, blinkTime, blinkPause, "easeInOutSine");
		}
		
		public function close():void {
			blinkTimer.stop();
			eyelid.rotX.setValueTween(1.0, blinkTime, 0.0, "easeOutCubic");
		}
		
		public function open():void {
			blinkTimer.reset();
			blinkTimer.start();
		}
		
		public function lookAt(posX:Number, posY:Number):void {
			eyeball.rotX.value = posY;
			eyeball.rotY.value = posX;
			
			eyebrow_i.movY.value = posY / 2.75;
			eyebrow_o.movY.value = posY / 2.0;
		}
		
	}
}