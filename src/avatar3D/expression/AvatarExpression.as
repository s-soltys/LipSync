package avatar3D.expression 
{
	import avatar3D.expression.setting.ExpressionParameter;
	/**
	 * ...
	 * @author S
	 */
	public class AvatarExpression
	{
		public var alias:String;
		public var id:int;
		
		public var jaw:ExpressionParameter;
		public var tongue:ExpressionParameter;
		public var mouth_r:ExpressionParameter;
		public var mouth_l:ExpressionParameter;
		public var lip_down_r:ExpressionParameter;
		public var lip_down_m:ExpressionParameter;
		public var lip_down_l:ExpressionParameter;
		public var lip_top_r:ExpressionParameter;
		public var lip_top_m:ExpressionParameter;
		public var lip_top_l:ExpressionParameter;
		public var cheek_r:ExpressionParameter;
		public var cheek_l:ExpressionParameter;
		public var cheekb_r:ExpressionParameter;
		public var cheekb_l:ExpressionParameter;
		
		
		public function AvatarExpression(xml:Object) {
			this.alias = xml.@alias;
			this.id = parseInt(xml.@id);
			
			jaw = new ExpressionParameter(xml.jaw);
			tongue = new ExpressionParameter(xml.tongue);
			mouth_r = new ExpressionParameter(xml.mouth_r);
			mouth_l = new ExpressionParameter(xml.mouth_l);
			lip_down_r = new ExpressionParameter(xml.lip_down_r);
			lip_down_m = new ExpressionParameter(xml.lip_down_m);
			lip_down_l = new ExpressionParameter(xml.lip_down_l);
			lip_top_r = new ExpressionParameter(xml.lip_top_r);
			lip_top_m = new ExpressionParameter(xml.lip_top_m);
			lip_top_l = new ExpressionParameter(xml.lip_top_l);
			cheek_r = new ExpressionParameter(xml.cheek_r);
			cheek_l = new ExpressionParameter(xml.cheek_l);
			cheekb_r = new ExpressionParameter(xml.cheekb_r);
			cheekb_l = new ExpressionParameter(xml.cheekb_l);
		}
		
	}
}