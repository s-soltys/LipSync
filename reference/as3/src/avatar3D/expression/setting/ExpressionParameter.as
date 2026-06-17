package avatar3D.expression.setting 
{
	/**
	 * ...
	 * @author S
	 */
	public class ExpressionParameter
	{
		public var rotation:Boolean;
		public var rot_x:Number = 0.0;
		public var rot_y:Number = 0.0;
		public var rot_z:Number = 0.0;
		
		public var movement:Boolean;
		public var mov_x:Number = 0.0;
		public var mov_y:Number = 0.0;
		public var mov_z:Number = 0.0;
		
		
		public function ExpressionParameter(xml:XMLList) {
			if ((xml.attribute("rot_x").length() + xml.attribute("rot_y").length() + xml.attribute("rot_z").length()) > 0) {
				rotation = true;
			}
			rot_x = xml.@rot_x;
			rot_y = xml.@rot_y;
			rot_z = xml.@rot_z;
			
			
			if ((xml.attribute("mov_x").length() + xml.attribute("mov_y").length() + xml.attribute("mov_z").length()) > 0) {
				movement = true;
			}
			mov_x = xml.@mov_x;
			mov_y = xml.@mov_y;
			mov_z = xml.@mov_z;
		}
		
	}
}