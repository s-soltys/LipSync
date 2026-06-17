package avatar3D.face.neck 
{
	import avatar3D.core.AvatarFeature;
	import away3d.containers.ObjectContainer3D;
	
	/**
	 * ...
	 * @author S
	 */
	public class AvatarNeck
	{
		private var neckLow:AvatarFeature;
		private var neckHigh:AvatarFeature;
		
		public function AvatarNeck(avatar:ObjectContainer3D, xml:XMLList) {
			neckLow = new AvatarFeature(avatar, xml.neck_low);
			neckHigh = new AvatarFeature(avatar, xml.neck_high);
		}
		
		public function lookAt(posX:Number, posY:Number):void {
			neckHigh.rotZ.value = posX;
			neckHigh.rotX.value = -posY;
			neckHigh.rotY.value = posX;
			
			neckLow.rotZ.value = posX;
			neckLow.rotX.value = -posY;
		}
		
	}
}