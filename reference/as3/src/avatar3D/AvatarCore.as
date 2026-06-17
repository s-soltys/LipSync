package avatar3D
{
	import avatar3D.expression.AvatarExpression;
	import avatar3D.expression.ExpressionsCollection;
	import avatar3D.face.neck.AvatarNeck;
	import away3d.containers.ObjectContainer3D;
	import avatar3D.face.eyes.AvatarEye;
	import avatar3D.face.mouth.AvatarMouth;
	import flash.events.Event;
	import flash.events.TimerEvent;
	import flash.utils.Timer;
	/**
	 * ...
	 * @author S
	 */
	public class AvatarCore
	{
		protected var avatar:ObjectContainer3D;
		
		internal var left_eye:AvatarEye;
		internal var right_eye:AvatarEye;
		internal var mouth:AvatarMouth;
		internal var neck:AvatarNeck;
		
		internal var blinkDelay:Number;
		private var blinkTimer:Timer;
		
		private var visemeValue:Number;
		private var viseme:AvatarExpression;
		private var emotionValue:Number;
		private var emotion:AvatarExpression;
		
		
		public function AvatarCore() {
			
		}
		
		protected function initAvatarCore():void {
			blinkTimer = new Timer(blinkDelay, 0);
			blinkTimer.addEventListener(TimerEvent.TIMER, onBlinkTimer);
			blinkTimer.start();
		}
		
		
		public function setAvatarObject3D(avatar:ObjectContainer3D):void {
			this.avatar = avatar;
		}
		
		public function getAvatarObject3D():ObjectContainer3D {
			return this.avatar;
		}
		
		
		public function setEmotion(emotion:AvatarExpression, value:Number = NaN):void {
			this.emotion = emotion;
			
			if (isNaN(value)) {
				value = emotionValue;
			} else {
				emotionValue = value;
			}
			
			mouth.setViseme(value, emotion);
		}
		
		public function setViseme(viseme:AvatarExpression, value:Number = NaN):void {
			this.viseme = viseme;
			
			if (isNaN(value)) {
				value = visemeValue;
			} else {
				visemeValue = value;
			}
			
			mouth.setViseme(value, viseme);
		}
		
		public function setVisemeValue(value:Number):void {
			var change:Number = value / visemeValue;
			
			visemeValue = value;
			
			//mouth.setExpression(value, viseme, emotion);
			//mouth.refreshExpression(change);
		}
		
		public function setEmotionValue(value:Number):void {
			var change:Number = value / emotionValue;
			
			//trace(change + " * " + emotionValue);
			
			emotionValue = value;
			if (isNaN(change)) change = 0.001;
			
			mouth.setViseme(emotionValue, emotion);
			//mouth.refreshExpression(change);
		}
		
		
		private function onBlinkTimer(event:Event):void {
			left_eye.blink();
			right_eye.blink();
		}
		
		public function lookAt(mouseX:Number, mouseY:Number):void {
			var posX:Number = (400 - mouseX) / 400;
			var posY:Number = (400 - mouseY) / 400;
			
			neck.lookAt(posX / 2, posY / 2);
			
			left_eye.lookAt(posX, posY);
			right_eye.lookAt(posX, posY);
		}
		
		public function lookAtTween():void {
			
		}
		
		public function openMouth(value:Number):void {
			mouth.jaw.rotX.value = value;
		}
		
	}
}