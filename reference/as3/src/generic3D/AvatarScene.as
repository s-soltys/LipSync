package generic3D 
{
	import avatar3D.AvatarAnimator;
	import away3d.cameras.Camera3D;
	import away3d.containers.ObjectContainer3D;
	import away3d.containers.Scene3D;
	import away3d.containers.View3D;
	import flash.events.Event;
	/**
	 * ...
	 * @author S
	 */
	public class AvatarScene extends View3D
	{
		
		public function AvatarScene() {
			camera = new Camera3D();
			scene = new Scene3D();
			
			this.addEventListener(Event.ENTER_FRAME, onEnterFrame);
		}
		
		public function addAvatar(avatar:AvatarAnimator):void {
			scene.addChild(avatar.getAvatarObject3D());
		}
		
		public function removeAvatar(avatar:AvatarAnimator):void {
			scene.removeChild(avatar.getAvatarObject3D());
		}
		
		private function onEnterFrame(event:Event):void {
			this.render();
		}
	}

}