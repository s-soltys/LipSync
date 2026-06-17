package avatar3D
{
	import avatar3D.expression.ExpressionsCollection;
	import avatar3D.face.mouth.AvatarMouth;
	import util.AvatarXMLProvider;
	import avatar3D.face.eyes.AvatarEye;
	import avatar3D.face.neck.AvatarNeck;
	import away3d.containers.ObjectContainer3D;
	import avatar3D.AvatarCore;
	import avatar3D.AvatarAnimator;
	
	/**
	 * ...
	 * @author S
	 */
	public class AvatarBuilder
	{
		private var avatarObject:ObjectContainer3D;
		private var avatarXML:XML;
		
		private var avatar:AvatarAnimator;
		
		public function AvatarBuilder(avatarObject:ObjectContainer3D) {
			this.avatarObject = avatarObject;
			
			avatar = new AvatarAnimator();
			avatar.setAvatarObject3D(avatarObject);
			
			var avatarXMLProvider:AvatarXMLProvider = new AvatarXMLProvider();
			avatarXML = avatarXMLProvider.xml;
			
			initExpressions();
		}
		
		private function initExpressions():void {
			ExpressionsCollection.initCollection(avatarXML.expressions);
		}
		
		public function buildAvatar():AvatarAnimator {
			setupAvatarEyes();
			setupAvatarNeck();
			setupAvatarMouth();
			
			avatar.initAvatar();
			
			return avatar;
		}
		
		private function setupAvatarEyes():void {
			var eyesXML:XMLList = avatarXML.avatar.face_features.eyes;
			var blinkDelay:Number = eyesXML.@blink_delay;
			var blinkTime:Number = eyesXML.@blink_time;
			var blinkPause:Number = eyesXML.@blink_pause;
			
			avatar.blinkDelay = blinkDelay * 1000;
			
			avatar.left_eye = new AvatarEye(avatarObject, eyesXML.left_eye);
			avatar.right_eye = new AvatarEye(avatarObject, eyesXML.right_eye);
			
			avatar.left_eye.setupMotionParameters(blinkTime, blinkPause);
			avatar.right_eye.setupMotionParameters(blinkTime, blinkPause);
		}
		
		private function setupAvatarMouth():void {
			var mouthXML:XMLList = avatarXML.avatar.face_features.mouth;
			
			avatar.mouth = new AvatarMouth(avatarObject, mouthXML);
		}
		
		private function setupAvatarNeck():void {
			var neckXML:XMLList = avatarXML.avatar.face_features.neck;
			
			avatar.neck = new AvatarNeck(avatarObject, neckXML);
		}
		
	}
}